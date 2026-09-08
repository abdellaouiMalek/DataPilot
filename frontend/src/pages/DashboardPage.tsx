import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity, ArrowRight, History, Layers,
  Loader2, Minus, ShieldAlert, TrendingDown, TrendingUp,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { getMaturityLevels, bankLogoSrc } from '../lib/config';
import type { MaturityLevel } from '../lib/config';
import { getMyAssessments, questionnaireUrl } from '../lib/assessment';
import type { AssessmentResult } from '../lib/assessment';

/**
 * Vue consolidee des evaluations de la banque de l'utilisateur.
 *
 * Tout vient de `/api/assessments/me`, deja restreint a la banque de
 * l'appelant cote serveur (`get_bank_scope`) : la page n'a aucun filtre de
 * securite a appliquer elle-meme, et ne peut rien afficher qui vienne d'une
 * autre banque. C'est la meme source que l'Historique, si bien que les deux
 * pages ne peuvent pas afficher des chiffres differents.
 *
 * Il n'y a volontairement aucun comparatif sectoriel : un utilisateur banque
 * n'a pas acces aux evaluations des autres banques, et un classement invente
 * pour remplir la section serait pire que son absence. La comparaison entre
 * banques existe, mais dans le back-office (`/super-admin`).
 */

const dateShort = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });

const dateLong = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased">
      <Navbar />
      {children}
    </div>
  );
}

/** Message pleine page : chargement, erreur, ou absence d'evaluation. */
function Notice({ text, action }: { text: string; action?: { label: string; to: string } }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 text-center py-32">
      <p className="text-sm font-medium text-gray-600 max-w-md">{text}</p>
      {action && (
        <button
          onClick={() => navigate(action.to)}
          className="px-5 py-2.5 rounded-lg text-sm font-bold bg-black text-white hover:bg-[#FFE600] hover:text-black transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Panel({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm h-full overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-gray-100">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400 font-medium">-</span>;
  const Icon = value > 0.001 ? TrendingUp : value < -0.001 ? TrendingDown : Minus;
  const tone = value > 0.001 ? 'text-emerald-500' : value < -0.001 ? 'text-red-400' : 'text-gray-400';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${tone}`}>
      <Icon className="w-3.5 h-3.5" />
      {value > 0 ? '+' : ''}{value.toFixed(2)}
    </span>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();

  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [assessments, setAssessments] = useState<AssessmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMaturityLevels(), getMyAssessments()])
      .then(([levels, mine]) => {
        if (cancelled) return;
        setMaturityLevels(levels);
        setAssessments(mine);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const bandFor = (score: number) =>
    maturityLevels.find((l) => score >= l.min_score && score <= l.max_score) ?? maturityLevels[0];

  // L'API renvoie les plus recentes d'abord ; l'ordre chronologique est celui
  // qui a du sens pour une progression.
  const chronological = useMemo(
    () => [...assessments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [assessments],
  );

  const latest = chronological.length ? chronological[chronological.length - 1] : null;
  const previous = chronological.length > 1 ? chronological[chronological.length - 2] : null;

  /** Courbe du score global : une evaluation par point. */
  const trend = useMemo(
    () => chronological
      .filter((a) => a.score_global !== null)
      .map((a) => ({ date: dateShort(a.created_at), score: a.score_global as number })),
    [chronological],
  );

  /** Dimensions de la derniere evaluation, la plus faible en premier. */
  const profile = useMemo(() => {
    if (!latest) return [];
    const before = new Map(previous?.dimension_scores.map((d) => [d.key, d.score]) ?? []);
    return [...latest.dimension_scores]
      .sort((a, b) => a.score - b.score)
      .map((d) => ({
        key: d.key,
        name: d.name,
        score: d.score,
        // null quand la dimension n'existait pas dans l'evaluation precedente :
        // les deux peuvent porter sur des versions differentes du questionnaire.
        delta: before.has(d.key) ? d.score - (before.get(d.key) as number) : null,
      }));
  }, [latest, previous]);

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center gap-3 text-gray-400 py-32">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Chargement du tableau de bord…</span>
        </div>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <Notice
          text="Impossible de charger votre tableau de bord. Vérifiez que l'API est démarrée, puis réessayez."
          action={{ label: "Retour à l'accueil", to: '/' }}
        />
      </Shell>
    );
  }

  if (!latest) {
    return (
      <Shell>
        <Notice
          text="Aucune évaluation n'a encore été soumise pour votre banque. Complétez-en une pour ouvrir votre tableau de bord."
          action={{ label: 'Démarrer une évaluation', to: '/' }}
        />
      </Shell>
    );
  }

  // `get_bank_scope` ne restreint pas un super administrateur : la liste
  // couvrirait alors plusieurs banques, ce que cette page ne sait pas
  // representer honnetement. Le tableau de bord inter-banques est ailleurs.
  if (new Set(assessments.map((a) => a.bank_id)).size > 1) {
    return (
      <Shell>
        <Notice
          text="Cette page présente les résultats d'une seule banque. Votre compte n'étant rattaché à aucune banque, la vue consolidée de toutes les banques se trouve dans le back-office."
          action={{ label: 'Ouvrir le back-office', to: '/super-admin' }}
        />
      </Shell>
    );
  }

  const globalScore = latest.score_global ?? 0;
  const band = bandFor(globalScore);
  const scoreDelta = previous?.score_global != null && latest.score_global != null
    ? latest.score_global - previous.score_global
    : null;
  const weakest = profile.length ? profile[0] : null;
  const strongest = profile.length ? profile[profile.length - 1] : null;
  // Un profil plat n'a ni point fort ni point faible : le tri conserve l'ordre
  // d'origine, donc designer le premier et le dernier reviendrait a inventer
  // un ecart a partir d'un ordre arbitraire.
  const flatProfile = !!strongest && !!weakest && strongest.score - weakest.score < 0.005;

  const kpis = [
    {
      label: 'Score global',
      value: globalScore.toFixed(2),
      unit: '/ 5',
      foot: scoreDelta !== null
        ? <Delta value={scoreDelta} />
        : <span className="text-xs text-gray-400 font-medium">Première évaluation</span>,
    },
    {
      label: 'Niveau de maturité',
      value: latest.maturity_label ?? band?.label ?? '-',
      foot: band
        ? <span className="text-xs text-gray-500 font-medium">Palier {band.min_score} - {band.max_score}</span>
        : null,
    },
    {
      label: 'Évaluations réalisées',
      value: String(chronological.length),
      foot: <span className="text-xs text-gray-500 font-medium">Dernière le {dateLong(latest.created_at)}</span>,
    },
    {
      label: 'Dimension la plus faible',
      value: weakest ? weakest.score.toFixed(2) : '-',
      unit: weakest ? '/ 5' : undefined,
      foot: weakest
        ? <span className="text-xs text-gray-500 font-medium truncate block" title={weakest.name}>{weakest.name}</span>
        : null,
    },
  ];

  // Le questionnaire attend le profil (etablissement, departement, role) dans
  // son URL : y arriver sans lui affiche « Veuillez d'abord renseigner votre
  // profil ». On le reconstruit depuis la derniere evaluation soumise *par
  // cette personne* -- pas la derniere de la banque, qui peut etre celle d'un
  // collegue et porterait donc son departement a lui. A defaut, retour au
  // formulaire d'accueil, qui pre-remplit desormais ces deux champs.
  const mine = [...chronological].reverse().find((a) => a.submitted_by_me);
  const startAssessment = () => {
    if (mine?.department && mine.evaluator_role) {
      navigate(questionnaireUrl({
        bankId: latest.bank_id,
        bank: latest.bank,
        department: mine.department,
        role: mine.evaluator_role,
      }));
    } else {
      navigate('/');
    }
  };

  // Chaque action emporte l'evaluation concernee : sans elle, la page
  // d'arrivee n'a rien a afficher et rend son etat vide.
  const actions = [
    {
      label: "Plan d'action",
      icon: ArrowRight,
      primary: true,
      go: () => navigate(`/recommendations/${latest.id}`),
    },
    {
      label: 'Mes évaluations',
      icon: History,
      go: () => navigate('/historique'),
    },
  ];

  return (
    <Shell>
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10 space-y-5 sm:space-y-6">

        {/* En-tete : l'identite de la banque et les actions sur une seule
            ligne. Le nombre d'evaluations et la date de la derniere ne sont
            pas repris ici -- ils sont deja portes par les indicateurs. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            {latest.bank_logo_url && (
              <img
                src={bankLogoSrc(latest.bank_logo_url) ?? undefined}
                alt=""
                className="w-9 h-9 rounded-full object-contain bg-white border border-gray-100 flex-shrink-0"
              />
            )}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 truncate">
              {latest.bank}
            </h1>
            {band && (
              <span
                className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase"
                style={{ backgroundColor: band.color, color: '#1A1A1A' }}
              >
                {latest.maturity_label ?? band.label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={action.go}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-colors ${
                  action.primary
                    ? 'bg-black text-white hover:bg-[#FFE600] hover:text-black'
                    : 'bg-white border border-gray-200 text-gray-700 hover:border-black hover:text-black'
                }`}
              >
                {action.label}
                <action.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </motion.div>

        {/* Indicateurs, tous lus sur la derniere evaluation soumise */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
        >
          {kpis.map((kpi) => (
            <div key={kpi.label} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#FFE600]" />
              <div className="space-y-2 pt-1">
                <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase truncate">{kpi.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <div className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight truncate">{kpi.value}</div>
                  {kpi.unit && <span className="text-xs text-gray-400 font-medium">{kpi.unit}</span>}
                </div>
                <div className="min-h-[18px]">{kpi.foot}</div>
              </div>
            </div>
          ))}
        </motion.div>

        {/* L'evolution prend toute la largeur : la colonne etroite qu'elle
            partageait avec les actions rapides serrait la courbe pour rien. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        >
          {trend.length > 1 ? (
            <Panel title="Évolution du score global" subtitle="Un point par évaluation soumise.">
              <div className="w-full h-[220px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 12, right: 16, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#00000020' }} />
                    <YAxis domain={[0, 5]} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#00000020' }} />
                    <Tooltip
                      formatter={(value) => [`${Number(value).toFixed(2)} / 5`, 'Score global']}
                      contentStyle={{ border: '1px solid #00000010', borderRadius: 4, fontSize: 12 }}
                    />
                    {/* Reperes des paliers : sans eux, une courbe entre 0 et 5
                        ne dit pas si le score obtenu est bon ou mauvais. */}
                    {maturityLevels.slice(1).map((level) => (
                      <ReferenceLine
                        key={level.id}
                        y={level.min_score}
                        stroke={level.color}
                        strokeDasharray="4 4"
                        label={{ value: level.label, position: 'insideTopLeft', fontSize: 9, fill: '#9ca3af' }}
                      />
                    ))}
                    <Line
                      type="monotone" dataKey="score" stroke="#1a1a1a" strokeWidth={2.5}
                      dot={{ fill: '#FFE600', stroke: '#1a1a1a', strokeWidth: 2, r: 5 }} activeDot={{ r: 7 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          ) : (
            <Panel title="Évolution du score global" subtitle="Disponible à partir de la deuxième évaluation.">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
                <div className="flex items-start gap-3">
                  <Activity className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-500 max-w-lg">
                    Votre banque n'a soumis qu'une évaluation, le {dateLong(latest.created_at)}.
                    Une seconde permettra de mesurer la progression, dimension par dimension.
                  </p>
                </div>
                <button
                  onClick={startAssessment}
                  className="self-start shrink-0 px-5 py-2.5 rounded-lg text-xs font-bold tracking-wide bg-black text-white hover:bg-[#FFE600] hover:text-black transition-colors"
                >
                  Nouvelle évaluation
                </button>
              </div>
            </Panel>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6"
        >
          {/* Remplace l'ancien comparatif entre banques */}
          <div className="lg:col-span-8">
            <Panel
              title="Profil par dimension"
              subtitle={`Évaluation du ${dateLong(latest.created_at)}, la dimension la plus faible en premier.`}
            >
              <div className="w-full" style={{ height: Math.max(200, profile.length * 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profile} layout="vertical" margin={{ top: 16, right: 40, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#00000010" horizontal={false} />
                    <XAxis
                      type="number" domain={[0, 5]}
                      tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#00000020' }}
                    />
                    <YAxis
                      type="category" dataKey="name" width={148}
                      tick={{ fill: '#374151', fontSize: 11 }} axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#00000006' }}
                      formatter={(value) => [`${Number(value).toFixed(2)} / 5`, 'Score']}
                      contentStyle={{ border: '1px solid #00000010', borderRadius: 4, fontSize: 12 }}
                    />
                    {/* Le score global : voir d'un coup d'oeil ce qui tire la
                        moyenne vers le bas, plutot que de comparer des barres. */}
                    <ReferenceLine
                      x={globalScore} stroke="#1a1a1a" strokeDasharray="5 4"
                      label={{ value: `Moyenne ${globalScore.toFixed(2)}`, position: 'top', fontSize: 10, fill: '#1a1a1a' }}
                    />
                    <Bar dataKey="score" radius={[0, 3, 3, 0]} barSize={16}>
                      {profile.map((d) => (
                        <Cell key={d.key} fill={bandFor(d.score)?.color ?? '#d1d5db'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-3 border-t border-gray-100">
                {maturityLevels.map((level) => (
                  <div key={level.id} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: level.color }} />
                    <span className="text-[11px] text-gray-500 font-medium">{level.label}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Remplace l'ancien « Top performers » (un classement d'autres
              banques) par la lecture qui concerne reellement l'utilisateur. */}
          <div className="lg:col-span-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-7 h-full">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
                {previous ? <Layers className="w-4 h-4 text-gray-400" /> : <ShieldAlert className="w-4 h-4 text-gray-400" />}
                <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                  {previous ? 'Progression par dimension' : 'Points forts et axes de progrès'}
                </div>
              </div>

              <div className="pt-4 space-y-4">
                {previous ? (
                  <>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Écart avec l'évaluation du {dateLong(previous.created_at)}.
                    </p>
                    {profile.every((d) => d.delta === null) ? (
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Les deux évaluations portent sur des questionnaires différents : aucune
                        dimension ne leur est commune.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {profile
                          .filter((d) => d.delta !== null)
                          .sort((a, b) => (b.delta as number) - (a.delta as number))
                          .map((d) => (
                            <div key={d.key} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                              <span className="text-xs font-semibold text-gray-700 truncate" title={d.name}>{d.name}</span>
                              <Delta value={d.delta} />
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    {flatProfile ? (
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Vos {profile.length} dimensions sont au même niveau
                        ({(strongest as { score: number }).score.toFixed(2)} / 5) : aucune ne se
                        détache, ni en force ni en faiblesse.
                      </p>
                    ) : (
                      <>
                        {strongest && (
                          <div className="px-3 py-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
                            <div className="text-[10px] font-bold tracking-widest text-emerald-600 uppercase mb-1">Point fort</div>
                            <div className="text-sm font-semibold text-gray-900 truncate" title={strongest.name}>{strongest.name}</div>
                            <div className="text-xs font-bold mt-0.5" style={{ color: bandFor(strongest.score)?.color }}>
                              {strongest.score.toFixed(2)} / 5
                            </div>
                          </div>
                        )}
                        {weakest && (
                          <div className="px-3 py-2.5 bg-red-50 rounded-lg border border-red-100">
                            <div className="text-[10px] font-bold tracking-widest text-red-500 uppercase mb-1">
                              À renforcer en priorité
                            </div>
                            <div className="text-sm font-semibold text-gray-900 truncate" title={weakest.name}>{weakest.name}</div>
                            <div className="text-xs font-bold mt-0.5" style={{ color: bandFor(weakest.score)?.color }}>
                              {weakest.score.toFixed(2)} / 5
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </Shell>
  );
}
