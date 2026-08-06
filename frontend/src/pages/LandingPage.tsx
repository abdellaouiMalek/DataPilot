import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
import { Select as RadixSelect } from 'radix-ui';
import { Navbar } from '../components/Navbar';
import { getBanks, getDepartments, getRoles, getDimensions } from '../lib/config';
import type { Dimension } from '../lib/config';
import { isSuperAdmin, isAdmin } from '../lib/keycloak';
import { getProfile } from '../lib/profile';
import backImage from '../assets/back.png';

type Option = { value: string; label: string };

/**
 * Replaces react-select: that library renders a real hidden `<input>` for
 * type-to-filter, which the site's global `input:focus` rule (index.css,
 * border/shadow/background, all !important) kept painting on top of,
 * showing up as a stray box inside the field. Radix's Select has no such
 * input -- it's a button trigger + a listbox -- so there's nothing for
 * that global rule to catch, and no !important arms race to maintain.
 * Typing a letter while it's open still jumps to the first matching
 * option (built into Radix), which covers these short (<20 item) lists.
 */
function FieldSelect({
  placeholder,
  loadingPlaceholder,
  options,
  value,
  onChange,
  disabled,
  loading,
  error,
}: {
  placeholder: string;
  loadingPlaceholder: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
}) {
  const filled = !!value;
  return (
    <RadixSelect.Root value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <RadixSelect.Trigger
        className={`w-full h-12 flex items-center justify-between gap-2 rounded-lg border bg-white px-4 text-sm outline-none transition-colors ${
          error
            ? 'border-red-400 ring-2 ring-red-100'
            : filled ? 'border-[#FFE600]' : 'border-slate-200 hover:border-slate-300'
        } disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-[#FFE600] data-[state=open]:ring-2 data-[state=open]:ring-[#FFE600]/25`}
      >
        <RadixSelect.Value
          placeholder={loading ? loadingPlaceholder : placeholder}
          className={filled ? 'text-slate-900 font-medium' : 'text-slate-400'}
        />
        <RadixSelect.Icon>
          {loading ? (
            <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-slate-300" />
          ) : (
            <ChevronDown className={`w-4 h-4 flex-shrink-0 ${filled ? 'text-[#FFE600]' : 'text-slate-300'}`} />
          )}
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-[9999] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-slate-100 bg-white shadow-xl"
        >
          <RadixSelect.ScrollUpButton className="flex items-center justify-center py-1 text-slate-400">
            <ChevronDown className="w-4 h-4 rotate-180" />
          </RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport className="p-1 max-h-72">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center rounded-md px-3 py-2.5 text-sm text-slate-900 outline-none cursor-pointer select-none data-[highlighted]:bg-yellow-50 data-[state=checked]:bg-[#FFE600] data-[state=checked]:font-semibold"
              >
                <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="flex items-center justify-center py-1 text-slate-400">
            <ChevronDown className="w-4 h-4" />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Set by QuestionnairePage when the bank picked before login doesn't
  // match the bank Keycloak actually has the user attached to.
  const [bankError, setBankError] = useState(
    () => Boolean((location.state as { bankMismatch?: boolean } | null)?.bankMismatch)
  );
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  const [bankOptions, setBankOptions] = useState<Option[]>([]);
  const [deptOptions, setDeptOptions] = useState<Option[]>([]);
  const [roleOptions, setRoleOptions] = useState<Option[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Non-null once the user's own profile confirms which bank they're
  // attached to (admin-managed, see AdminUsers) -- when set, the bank
  // field below locks to it instead of offering an open choice, matching
  // what the backend already enforces on submit (see get_bank_scope).
  const [attachedBankId, setAttachedBankId] = useState<number | null>(null);

  // Admins don't take the assessment — send them straight to the back-office.
  // The landing page ("/") is where Keycloak returns after login.
  useEffect(() => {
    if (isSuperAdmin()) navigate('/super-admin', { replace: true });
    else if (isAdmin()) navigate('/admin', { replace: true });
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBanks(), getDepartments(), getRoles(), getDimensions()])
      .then(([banks, departments, roles, dims]) => {
        if (cancelled) return;
        const toOptions = (items: { name: string }[]) =>
          items.map((i) => ({ value: i.name, label: i.name }));
        // Banks are referenced by id (assessments carry a bank_id FK).
        setBankOptions(banks.map((b) => ({ value: String(b.id), label: b.name })));
        setDeptOptions(toOptions(departments));
        setRoleOptions(toOptions(roles));
        setDimensions([...dims].sort((a, b) => a.sort_order - b.sort_order));
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Separate, independent fetch: a profile hiccup shouldn't block the
  // whole page the way a config-load failure does above -- it just falls
  // back to an open (unlocked) bank selector.
  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((profile) => !cancelled && setAttachedBankId(profile.bank_id))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Once both the bank list and the user's attachment are known, lock
  // the selection to their bank instead of leaving it an open choice.
  useEffect(() => {
    if (attachedBankId != null && bankOptions.length > 0) {
      setSelectedBank(String(attachedBankId));
    }
  }, [attachedBankId, bankOptions]);

  const handleStart = () => {
    if (selectedBank && selectedDepartment && selectedRole) {
      const bankLabel = bankOptions.find((o) => o.value === selectedBank)?.label ?? '';
      // In the URL, not router state: if the user isn't logged in yet,
      // this navigation is about to be interrupted by a real redirect
      // through Keycloak (RequireAuth) and back -- only the URL survives
      // that round-trip, router state doesn't.
      const params = new URLSearchParams({
        bankId: selectedBank,
        bank: bankLabel,
        department: selectedDepartment,
        role: selectedRole,
      });
      navigate(`/questionnaire?${params.toString()}`);
    }
  };

  const canProceed = selectedBank && selectedDepartment && selectedRole;
  const filledCount = [selectedBank, selectedDepartment, selectedRole].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Navbar />

      {/* ── HERO ── */}
      <div className="relative overflow-hidden bg-white border-b border-slate-200">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-center bg-cover opacity-[0.06]"
          style={{ backgroundImage: `url(${backImage})` }}
        />
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#FFE600]" />

        <div className="relative max-w-5xl mx-auto px-6 md:px-16 py-16 md:py-24">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-block text-[10px] font-bold tracking-[0.25em] text-slate-400 mb-6">
              SECTEUR BANCAIRE TUNISIEN
            </span>
            <h1 className="text-[clamp(2.4rem,5.5vw,4.5rem)] font-bold text-slate-900 leading-[1.06] tracking-[-0.025em] mb-6">
              Diagnostic de maturité
              <br />
              <span className="text-slate-900">data </span>
              <span
                className="relative"
                style={{
                  background: 'linear-gradient(135deg, #111 0%, #555 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontStyle: 'italic',
                  fontWeight: 300,
                }}
              >
                &amp; analytique
              </span>
            </h1>
            <p className="text-lg text-slate-500 max-w-xl leading-relaxed font-light">
              Un outil d&apos;évaluation stratégique structuré en{' '}
              <strong className="font-semibold text-slate-700">
                {dimensions.length || 6} dimensions
              </strong>{' '}
              pour mesurer votre niveau de maturité et recevoir un plan d&apos;action personnalisé EY.
            </p>

            <div className="flex flex-wrap gap-6 mt-10">
              {[
                { val: `${dimensions.length || 6} dimensions`, sub: 'évaluées' },
                { val: '~20 min', sub: 'pour compléter' },
                { val: '5 niveaux', sub: 'de maturité' },
              ].map((s) => (
                <div key={s.val} className="flex items-center gap-2">
                  <div className="w-1 h-8 bg-[#FFE600] rounded-full" />
                  <div>
                    <p className="text-base font-bold text-slate-900 leading-tight">{s.val}</p>
                    <p className="text-xs text-slate-400 leading-tight">{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div className="max-w-5xl mx-auto px-6 md:px-16 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10 items-start">
          {/* LEFT: Dimensions */}
          <div className="space-y-8">
            <div>
              <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 mb-5">
                DIMENSIONS ÉVALUÉES
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {dimensions.map((dim, i) => (
                  <motion.div
                    key={dim.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.1 + i * 0.07 }}
                    className="group bg-white rounded-xl border border-slate-200 p-5 hover:border-[#FFE600] hover:shadow-md transition-all duration-200 cursor-default"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-[10px] font-bold font-mono bg-slate-900 text-[#FFE600] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 leading-tight mb-1">
                          {dim.short_name || dim.name}
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed">{dim.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Résultats attendus */}
            <div className="bg-slate-900 rounded-xl p-7 text-white">
              <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 mb-5">
                CE QUE VOUS OBTENEZ
              </p>
              <div className="space-y-3">
                {[
                  'Score de maturité global et par dimension',
                  'Positionnement par rapport au secteur bancaire tunisien',
                  "Plan d'action EY priorisé, généré par notre modèle de recommandation",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-4 h-4 text-[#FFE600] flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300 leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Form */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.25 }}
            className="lg:sticky lg:top-24 self-start"
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/60 overflow-hidden">
              {/* Progress bar */}
              <div className="h-1 bg-slate-100">
                <div
                  className="h-full bg-[#FFE600] transition-all duration-500"
                  style={{ width: `${(filledCount / 3) * 100}%` }}
                />
              </div>

              <div className="p-7">
                <h2 className="text-xl font-bold text-slate-900 mb-1">Commencer l&apos;évaluation</h2>
                <p className="text-sm text-slate-400 mb-7">
                  Renseignez votre profil pour personnaliser votre diagnostic.
                </p>

                {loadError && (
                  <div className="mb-5 rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    Impossible de charger les données. Vérifiez que l&apos;API est démarrée puis rechargez la page.
                  </div>
                )}

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold tracking-[0.15em] text-slate-500 mb-2">
                      ÉTABLISSEMENT BANCAIRE
                    </label>
                    <FieldSelect
                      options={bankOptions}
                      value={selectedBank}
                      onChange={(v) => { setSelectedBank(v); setBankError(false); }}
                      placeholder="Sélectionnez votre banque..."
                      loadingPlaceholder="Chargement..."
                      loading={loading}
                      disabled={loading || loadError || attachedBankId != null}
                      error={bankError}
                    />
                    {bankError ? (
                      <p className="mt-1.5 text-[11px] font-medium text-red-500">
                        Vous ne pouvez accéder qu'à la banque à laquelle vous êtes rattaché.
                      </p>
                    ) : attachedBankId != null && (
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        Banque associée à votre compte — pour la modifier, contactez un administrateur.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold tracking-[0.15em] text-slate-500 mb-2">
                      DÉPARTEMENT
                    </label>
                    <FieldSelect
                      options={deptOptions}
                      value={selectedDepartment}
                      onChange={setSelectedDepartment}
                      placeholder="Sélectionnez votre département..."
                      loadingPlaceholder="Chargement..."
                      loading={loading}
                      disabled={loading || loadError}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold tracking-[0.15em] text-slate-500 mb-2">
                      RÔLE
                    </label>
                    <FieldSelect
                      options={roleOptions}
                      value={selectedRole}
                      onChange={setSelectedRole}
                      placeholder="Sélectionnez votre rôle..."
                      loadingPlaceholder="Chargement..."
                      loading={loading}
                      disabled={loading || loadError}
                    />
                  </div>
                </div>

                <div className="mt-7 space-y-3">
                  <motion.button
                    onClick={handleStart}
                    disabled={!canProceed}
                    whileHover={canProceed ? { scale: 1.02 } : {}}
                    whileTap={canProceed ? { scale: 0.98 } : {}}
                    className={`w-full h-[52px] flex items-center justify-center gap-3 rounded-xl font-semibold text-sm tracking-wide transition-all duration-200 ${
                      canProceed
                        ? 'bg-[#FFE600] text-black hover:bg-[#f5d800] shadow-md shadow-yellow-200 cursor-pointer'
                        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    Commencer l&apos;évaluation
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>

                  <button
                    onClick={() => navigate('/historique')}
                    className="w-full text-xs text-slate-400 hover:text-slate-700 transition-colors py-2"
                  >
                    Accéder aux évaluations précédentes →
                  </button>
                </div>

                <p className="text-[11px] text-slate-300 mt-5 text-center leading-relaxed">
                  Réponses confidentielles — usage interne EY
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-200 bg-white px-6 md:px-12 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-[#FFE600] flex items-center justify-center">
            <span className="font-bold text-black text-[9px]">EY</span>
          </div>
          <span className="text-xs text-slate-400">© {new Date().getFullYear()} Ernst &amp; Young</span>
        </div>
        <span className="text-xs text-slate-300">CONFIDENTIEL</span>
      </footer>
    </div>
  );
}
