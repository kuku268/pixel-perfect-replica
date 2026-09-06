"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

  const router = useRouter();
  const { session, loading } = useAuth();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && session) router.push("/app");
  }, [loading, session, router]);

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
      router.push("/app");
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
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    />
  );
}
