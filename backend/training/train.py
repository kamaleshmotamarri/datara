"""Reviewed PyTorch template. Reads /job/job.json + data.csv, writes metrics.json + model.pt.

The model-written spec only chooses columns, task type and width. No generated code runs.
Limits: 20 epochs, 10 minutes, CPU, <=20,000 rows. Cleaning statistics come from the train split only.
"""
import json, sys, time, os
import numpy as np
import pandas as pd
import torch
from torch import nn

job_dir = sys.argv[1]
spec = json.load(open(os.path.join(job_dir, "job.json")))
t0 = time.time()
torch.manual_seed(0)
np.random.seed(0)

df = pd.read_csv(os.path.join(job_dir, "data.csv"), nrows=spec["max_rows"])
target, task = spec["target"], spec["task"]
feats = [c for c in spec["features"] if c in df.columns and c != target]
if target not in df.columns or not feats:
    raise SystemExit("Chosen target or feature columns are not in the file.")
df = df[feats + [target]].dropna(subset=[target]).reset_index(drop=True)
if len(df) < 50:
    raise SystemExit(f"Only {len(df)} usable rows. Not enough to train.")

idx = np.random.permutation(len(df))
cut = int(len(df) * 0.8)
train, test = df.iloc[idx[:cut]], df.iloc[idx[cut:]]

num = [c for c in feats if pd.api.types.is_numeric_dtype(train[c])]
cat = [c for c in feats if c not in num]
medians = {c: train[c].median() for c in num}
mean = {c: train[c].fillna(medians[c]).mean() for c in num}
std = {c: (train[c].fillna(medians[c]).std() or 1.0) for c in num}
levels = {c: list(train[c].astype(str).value_counts().index[:20]) for c in cat}

def encode(d):
    cols = [((d[c].fillna(medians[c]) - mean[c]) / std[c]).to_numpy(dtype=np.float32) for c in num]
    for c in cat:
        s = d[c].astype(str)
        cols += [(s == v).to_numpy(dtype=np.float32) for v in levels[c]]
    return np.stack(cols, 1)

Xtr, Xte = encode(train), encode(test)
if task == "classification":
    classes = sorted(train[target].astype(str).unique())
    cmap = {c: i for i, c in enumerate(classes)}
    ytr = train[target].astype(str).map(cmap).to_numpy()
    mask = test[target].astype(str).isin(cmap)
    Xte, test = Xte[mask.to_numpy()], test[mask]
    yte = test[target].astype(str).map(cmap).to_numpy()
    out_dim, loss_fn = len(classes), nn.CrossEntropyLoss()
    ytr_t, yte_t = torch.tensor(ytr, dtype=torch.long), torch.tensor(yte, dtype=torch.long)
else:
    ytr = train[target].to_numpy(dtype=np.float32)
    yte = test[target].to_numpy(dtype=np.float32)
    ym, ys = float(ytr.mean()), float(ytr.std() or 1.0)
    out_dim, loss_fn = 1, nn.MSELoss()
    ytr_t = torch.tensor((ytr - ym) / ys).unsqueeze(1)

model = nn.Sequential(nn.Linear(Xtr.shape[1], spec["hidden"]), nn.ReLU(), nn.Linear(spec["hidden"], spec["hidden"]), nn.ReLU(), nn.Linear(spec["hidden"], out_dim))
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
Xt = torch.tensor(Xtr)
for epoch in range(spec["epochs"]):
    if time.time() - t0 > spec["time_limit_s"]:
        break
    perm = torch.randperm(len(Xt))
    for i in range(0, len(Xt), 128):
        b = perm[i:i + 128]
        opt.zero_grad()
        loss_fn(model(Xt[b]), ytr_t[b]).backward()
        opt.step()

model.eval()
with torch.no_grad():
    pred = model(torch.tensor(Xte))
if task == "classification":
    p = pred.argmax(1).numpy()
    from sklearn.metrics import accuracy_score, f1_score, confusion_matrix
    maj = np.bincount(ytr).argmax()
    metrics = {"accuracy": float(accuracy_score(yte, p)), "macro_f1": float(f1_score(yte, p, average="macro")), "test_rows": int(len(yte))}
    base = {"accuracy": float(accuracy_score(yte, np.full_like(yte, maj))), "macro_f1": float(f1_score(yte, np.full_like(yte, maj), average="macro"))}
    extra = {"confusion_matrix": confusion_matrix(yte, p).tolist(), "classes": classes}
else:
    p = pred.squeeze(1).numpy() * ys + ym
    metrics = {"mae": float(np.abs(p - yte).mean()), "rmse": float(np.sqrt(((p - yte) ** 2).mean())), "test_rows": int(len(yte))}
    b = np.full_like(yte, ytr.mean())
    base = {"mae": float(np.abs(b - yte).mean()), "rmse": float(np.sqrt(((b - yte) ** 2).mean()))}
    extra = {}

torch.save(model.state_dict(), os.path.join(job_dir, "model.pt"))
json.dump({"metrics": metrics, "baseline": base, **extra,
           "cleaning": f"{len(df)} rows used; 80/20 split; numeric median-imputed and standardised and categorical top-20 one-hot, all fit on the training split only. Baseline: {'majority class' if task == 'classification' else 'training mean'}."},
          open(os.path.join(job_dir, "metrics.json"), "w"))
print("ok")
