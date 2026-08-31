import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Building2, Check, ChevronRight, Landmark, Loader2, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '../components/Navbar';
import keycloak, { isSuperAdmin } from '../lib/keycloak';
import { getProfile, updateProfile, type UserProfile } from '../lib/profile';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  consultant: 'Consultant',
  repondant: 'Répondant',
  validateur: 'Validateur',
};

const inputClass = 'w-full h-12 border border-gray-300 bg-white px-4 text-sm text-gray-900 outline-none transition-colors focus:border-black focus:ring-1 focus:ring-black placeholder:text-gray-400';

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'DP';
}

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-gray-500 uppercase">
        {icon}{label}
      </span>
      {children}
    </label>
  );
}

/**
 * Un compte back-office a son propre écran « Mon compte » : aucune banque de
 * rattachement, mais un historique d'actions que cette page-ci ne montre pas.
 * Le lien « Mon profil » de la barre reste donc unique — seule sa destination
 * dépend du rôle.
 */
export function ProfilePage() {
  if (isSuperAdmin()) {
    return <Navigate to="/super-admin/settings?tab=profile" replace />;
  }
  return <ClientProfile />;
}

function ClientProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile()
      .then((data) => {
        setProfile(data);
        setFirstName(data.first_name ?? '');
        setLastName(data.last_name ?? '');
        setEmail(data.email ?? '');
        setOrganization(data.organization ?? '');
      })
      .catch((error) => toast.error('Profil indisponible', {
        description: error instanceof Error ? error.message : 'Impossible de charger vos informations.',
      }))
      .finally(() => setLoading(false));
  }, []);

  const hasChanges = useMemo(() => !!profile && (
    firstName.trim() !== (profile.first_name ?? '') ||
    lastName.trim() !== (profile.last_name ?? '') ||
    email.trim() !== (profile.email ?? '') ||
    organization.trim() !== (profile.organization ?? '')
  ), [email, firstName, lastName, organization, profile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error('Informations incomplètes', { description: 'Le prénom, le nom et l’adresse email sont obligatoires.' });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile({
        first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim(),
        organization: organization.trim() || null,
      });
      setProfile(updated);
      await keycloak.updateToken(-1).catch(() => undefined);
      toast.success('Profil mis à jour', { description: 'Vos informations personnelles ont été enregistrées.' });
    } catch (error) {
      toast.error('Mise à jour impossible', {
        description: error instanceof Error ? error.message : 'Veuillez réessayer dans quelques instants.',
      });
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 font-sans"><Navbar />
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-gray-500 animate-spin" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <div className="mb-8 sm:mb-10">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] text-gray-400 uppercase mb-3">
              <span>Mon espace</span><ChevronRight className="w-3 h-3" /><span className="text-gray-700">Profil</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-light tracking-tight text-gray-900">Mon profil</h1>
            <p className="mt-3 text-sm text-gray-500 max-w-2xl">Gérez vos informations personnelles et les paramètres de sécurité de votre compte.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            <aside className="lg:col-span-4 space-y-6">
              <div className="bg-gray-900 text-white p-7 sm:p-8 relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-36 h-36 bg-[#FFE600]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10">
                  <div className="w-20 h-20 bg-[#FFE600] text-black flex items-center justify-center text-2xl font-black tracking-wide mb-6">
                    {initials(firstName, lastName)}
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight truncate">
                    {[firstName, lastName].filter(Boolean).join(' ') || 'Utilisateur DataPilot'}
                  </h2>
                  <p className="text-sm text-gray-400 mt-1 truncate">{email || '—'}</p>
                  <div className="mt-6 pt-5 border-t border-gray-700 flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-[#FFE600]" />
                    <div><div className="text-[9px] font-bold tracking-[0.18em] text-gray-500 uppercase">Rôle</div>
                      <div className="text-sm font-bold mt-0.5">{profile?.role ? ROLE_LABELS[profile.role] ?? profile.role : 'Utilisateur'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <section className="lg:col-span-8 bg-white border border-gray-200 shadow-sm">
              <div className="px-6 sm:px-8 py-6 border-b border-gray-100 flex items-center gap-4">
                <div className="w-11 h-11 bg-gray-100 flex items-center justify-center"><UserRound className="w-5 h-5 text-gray-700" /></div>
                <div><h2 className="text-xl font-light text-gray-900 tracking-tight">Informations personnelles</h2>
                  <p className="text-xs text-gray-500 mt-1">Les champs marqués d’un astérisque sont obligatoires.</p></div>
              </div>
              <form onSubmit={handleSubmit} className="p-6 sm:p-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <Field label="Prénom *" icon={<UserRound className="w-4 h-4" />}><input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputClass} /></Field>
                  <Field label="Nom *" icon={<UserRound className="w-4 h-4" />}><input value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputClass} /></Field>
                  <Field label="Adresse email *" icon={<Mail className="w-4 h-4" />}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} /></Field>
                  <Field label="Organisation" icon={<Building2 className="w-4 h-4" />}><input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Votre établissement" className={inputClass} /></Field>
                  <Field label="Banque" icon={<Landmark className="w-4 h-4" />}>
                    <input
                      value={profile?.bank_name ?? 'Aucune banque associée'}
                      disabled
                      className={`${inputClass} bg-gray-50 text-gray-500 cursor-not-allowed`}
                    />
                  </Field>
                </div>
                <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-[11px] text-gray-400">Votre rôle et votre banque associée sont gérés par un administrateur.</p>
                  <button type="submit" disabled={!hasChanges || saving || !profile}
                    className="inline-flex items-center justify-center gap-2 bg-black text-white px-6 py-3 text-xs font-bold tracking-wider uppercase hover:bg-[#FFE600] hover:text-black disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Enregistrer
                  </button>
                </div>
              </form>
            </section>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
