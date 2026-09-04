import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AuthCard } from "@/components/AuthCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

const title = "Create your account — Video Speed Reader";
const description =
  "Create a free Video Speed Reader account and turn your videos into accurate transcripts.";

export default function SignUp() {
  useDocumentMeta({ title, description });

  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate("/app");
  }, [loading, session, navigate]);

  async function handleSubmit(email: string, password: string) {
    setPending(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/app` },
    });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      navigate("/app");
    } else {
      toast.success("Check your inbox to confirm your email.");
    }
  }

  return (
    <AuthCard
      heading="Create your account / 註冊"
      subheading="Start turning videos into transcripts in three minutes."
      submitLabel="Sign up / 註冊"
      pending={pending}
      onSubmit={handleSubmit}
      footer={
        <>
          Already have an account?{" "}
          <Link to="/signin" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    />
  );
}
