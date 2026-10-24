import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="auth-shell">
      <Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}
