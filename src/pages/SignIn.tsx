import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AuthCard } from "@/components/AuthCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

const title = "Sign in — Video Speed Reader";
const description = "Sign in to Video Speed Reader to manage your video transcripts.";

export default function SignIn() {
  useDocumentMeta({ title, description });

  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate("/app");
  }, [loading, session, navigate]);

  async function handleSubmit(email: string, password: string) {
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate("/app");
  }

  return (
    <AuthCard
      heading="Welcome back / 歡迎回來"
      subheading="Sign in to your Video Speed Reader account."
      submitLabel="Sign in / 登入"
      pending={pending}
      onSubmit={handleSubmit}
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </>
      }
    />
  );
}
