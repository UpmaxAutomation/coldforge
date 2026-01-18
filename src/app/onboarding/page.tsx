import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CreateOrganization } from '@/components/onboarding/create-organization';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user already has an organization
  const { data: profile } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  // If user already has an organization, redirect to dashboard
  if (profile?.organization_id) {
    redirect('/dashboard');
  }

  return <CreateOrganization />;
}
