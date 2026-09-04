import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthCard } from "@/components/AuthCard";

const title = "Sign in — Video Speed Reader";
const description = "Sign in to Video Speed Reader to manage your video transcripts.";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/app" });
  }, [loading, session, navigate]);

  async function handleSubmit(email: string, password: string) {
    setPending(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/app" });
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
