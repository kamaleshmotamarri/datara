FROM python:3.12-slim
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir pandas numpy scikit-learn
COPY train.py /app/train.py
USER 65534
