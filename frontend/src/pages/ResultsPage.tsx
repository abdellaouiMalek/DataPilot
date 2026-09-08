import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import {
  TrendingUp, TrendingDown, ArrowUpRight, Target, BarChart3,
  Loader2, Building2, Calendar, Sparkles, Check, Share2, Download, History,
  RefreshCw, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '../components/Navbar';
import { FlowHeader } from '../components/FlowHeader';
import { getMaturityLevels, bankLogoSrc } from '../lib/config';
import type { MaturityLevel } from '../lib/config';
import { getAssessment } from '../lib/assessment';
import type { AssessmentResult } from '../lib/assessment';
import { getNarrative } from '../lib/recommendations';
import { downloadEvaluationReport } from '../lib/reports';
import { tint } from '../lib/utils';

export function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const assessmentId = Number(useParams().assessmentId);

  // L'évaluation qui vient d'être soumise est passée dans l'état du routeur :
  // elle est déjà en mémoire, autant l'afficher sans attendre un aller-retour
  // réseau. Ce n'est qu'une optimisation du premier rendu -- l'id de l'URL
  // reste la source, et un rechargement (qui vide cet état) recharge la page
  // depuis l'API au lieu de tomber sur un écran vide comme avant.
  const submitted = (location.state || {}) as { result?: AssessmentResult };
  const [result, setResult] = useState<AssessmentResult | null>(
    submitted.result?.id === assessmentId ? submitted.result : null,
  );

  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const assessment = result
      ? Promise.resolve(result)
      : getAssessment(assessmentId).catch((error) => {
        if (!cancelled) setNotFound(true);
        throw error;
      });

    Promise.all([getMaturityLevels(), assessment])
      .then(([levels, data]) => {
        if (cancelled) return;
        setMaturityLevels(levels);
        setResult(data);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  // Executive synthesis, streamed reveal of the real LLM-authored narrative
  // for this assessment (same endpoint RecommendationsPage uses).
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeStatus, setNarrativeStatus] = useState<'idle' | 'loading' | 'streaming' | 'done' | 'error'>('idle');
  const [streamText, setStreamText] = useState('');
  const [narrativeVersion, setNarrativeVersion] = useState(0);

  useEffect(() => {
    if (!result?.id) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    setNarrativeStatus('loading');
    setStreamText('');
    setNarrative(null);

    getNarrative(result.id)
      .then((res) => {
        if (cancelled) return;
        const text = res.narrative;
        setNarrative(text);
        setNarrativeStatus('streaming');
        let i = 0;
        interval = setInterval(() => {
          i += Math.floor(Math.random() * 5) + 3;
          if (i >= text.length) {
            setStreamText(text);
            if (interval) clearInterval(interval);
            setNarrativeStatus('done');
          } else {
            setStreamText(text.slice(0, i));
          }
        }, 12);
      })
      .catch(() => {
        if (!cancelled) setNarrativeStatus('error');
      });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [result?.id, narrativeVersion]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Chargement des résultats…</span>
        </div>
      </div>
    );
  }

  if (loadError || maturityLevels.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Impossible de charger les niveaux de maturité. Vérifiez que l'API est démarrée, puis réessayez.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  // Scores come exclusively from the submitted assessment.
  const displayScores: Record<string, number> = {};
  const dimensionLabels: Record<string, string> = {};
  for (const d of result?.dimension_scores ?? []) {
    displayScores[d.key] = d.score;
    dimensionLabels[d.key] = d.name;
  }

  // Id inconnu, ou évaluation d'une autre banque (l'API répond 404 dans les
  // deux cas). Retour au tableau de bord plutôt qu'à l'accueil : c'est de là
  // que part le parcours.
  if (notFound || !result || Object.keys(displayScores).length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Cette évaluation est introuvable. Elle a peut-être été supprimée, ou
            appartient à une autre banque.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  const globalScore = result.score_global ?? 0;

  const getMaturityLevel = (score: number) =>
    maturityLevels.find((level) => score >= level.min_score && score <= level.max_score) || maturityLevels[0];

  // Use the label the backend computed when present; otherwise map by range.
  const maturity =
    (result.maturity_label
      ? maturityLevels.find((l) => l.label === result.maturity_label)
      : undefined) || getMaturityLevel(globalScore);

  const radarData = Object.entries(displayScores).map(([dim, value]) => ({
    dimension: dimensionLabels[dim] ?? dim,
    value,
    fullMark: 5,
  }));

  const strengths = Object.entries(displayScores).filter(([, s]) => s >= 3.5).map(([d]) => d);
  const weaknesses = Object.entries(displayScores).filter(([, s]) => s < 3).map(([d]) => d);

  const context = [result.department, result.evaluator_role].filter(Boolean).join(' · ');
  const scoreEntries = Object.entries(displayScores);
  const aiActive = narrativeStatus === 'loading' || narrativeStatus === 'streaming';

  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased overflow-x-hidden">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-6 sm:space-y-8">

        <FlowHeader current="Résultats" />

        {/* ── PAGE TITLE + ACTIONS ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {result.bank_logo_url ? (
              <img
                src={bankLogoSrc(result.bank_logo_url) ?? undefined}
                alt=""
                className="w-4 h-4 rounded-full object-contain bg-white border border-gray-100"
              />
            ) : (
              <Building2 className="w-3.5 h-3.5" />
            )}
            <span className="font-bold text-gray-700">{result.bank}</span>
            {context && <span>· {context}</span>}
            <span>· Dossier #{result.id}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toast('Lien copié', { icon: <Check className="w-4 h-4 text-green-500" /> })}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 hover:border-gray-400 transition-colors rounded-lg"
            >
              <Share2 className="w-3.5 h-3.5" />
              Partager
            </button>
            <button
              onClick={() => toast.promise(downloadEvaluationReport(result.id), {
                loading: 'Génération du rapport PDF…',
                success: 'Rapport PDF téléchargé',
                error: 'Échec du téléchargement du rapport PDF',
              })}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-gray-900 text-white hover:bg-black transition-colors rounded-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger PDF
            </button>
          </div>
        </div>

        {/* ── SCORE HERO ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
        >
          <div className="h-1 w-full" style={{ backgroundColor: maturity.color }} />

          <div className="p-6 sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold tracking-[0.18em] px-2.5 py-1 rounded-full text-gray-800"
                  style={{ backgroundColor: tint(maturity.color, '26') }}
                >
                  {maturity.label.toUpperCase()}
                </span>
                <span className="text-xs text-gray-400 hidden sm:inline">{maturity.description}</span>
              </div>
              <span className="text-xs text-gray-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(result.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 sm:gap-10 items-center">
              {/* Circular gauge */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-40 h-40 sm:w-44 sm:h-44">
                  <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                    <circle cx="80" cy="80" r="66" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                    <motion.circle
                      cx="80" cy="80" r="66"
                      fill="none"
                      stroke={maturity.color}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 66}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 66 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 66 * (1 - globalScore / 5) }}
                      transition={{ duration: 1.4, delay: 0.2, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-gray-900 leading-none">
                      {globalScore.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-400 mt-1">/ 5.0</span>
                  </div>
                </div>
                <p className="text-[10px] font-bold tracking-[0.18em] text-gray-400">SCORE GLOBAL</p>
              </div>

              {/* Dimension scores grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
                {scoreEntries.map(([dim, score], i) => {
                  const lvl = getMaturityLevel(score);
                  return (
                    <motion.div
                      key={dim}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 + i * 0.07 }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-700">{dimensionLabels[dim]}</span>
                        <span
                          className="text-xs font-bold text-gray-800 px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: tint(lvl.color, '26') }}
                        >
                          {score.toFixed(1)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(score / 5) * 100}%` }}
                          transition={{ duration: 1, delay: 0.4 + i * 0.08, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: lvl.color }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-8 pt-6 border-t border-gray-100">
              {maturityLevels.map((l) => (
                <div key={l.id} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-[10px] text-gray-400 font-medium">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── RADAR + INSIGHTS ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6"
        >
          {/* Radar */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400 mb-1">
              EMPREINTE DE MATURITÉ
            </p>
            <p className="text-sm text-gray-500 mb-6">Distribution des scores sur les {radarData.length} axes</p>
            <div className="h-[280px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Radar
                    name="Score"
                    dataKey="value"
                    stroke="#111827"
                    strokeWidth={2.5}
                    fill="#FFE600"
                    fillOpacity={0.35}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Insights */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6">
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400 mb-1">
                ANALYSE STRATÉGIQUE
              </p>
              <p className="text-sm text-gray-500">Forces et axes prioritaires identifiés</p>
            </div>

            {strengths.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <span className="text-[10px] font-bold tracking-[0.15em] text-emerald-600">
                    POINTS FORTS
                  </span>
                </div>
                <div className="space-y-2">
                  {strengths.map((dim) => (
                    <div key={dim} className="flex items-center justify-between px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                      <span className="text-xs font-semibold text-gray-700">{dimensionLabels[dim]}</span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                        {displayScores[dim].toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {weaknesses.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-[10px] font-bold tracking-[0.15em] text-red-500">
                    AXES PRIORITAIRES
                  </span>
                </div>
                <div className="space-y-2">
                  {weaknesses.map((dim) => (
                    <div key={dim} className="flex items-center justify-between px-3 py-2 bg-red-50 rounded-lg border border-red-100">
                      <span className="text-xs font-semibold text-gray-700">{dimensionLabels[dim]}</span>
                      <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">
                        {displayScores[dim].toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {strengths.length === 0 && weaknesses.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                Scores équilibrés sur l'ensemble des dimensions.
              </p>
            )}
          </div>
        </motion.div>

        {/* ── ANALYSE IA ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400">SYNTHÈSE IA</p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {(narrativeStatus === 'done' || narrativeStatus === 'error') && (
                <button
                  onClick={() => setNarrativeVersion((v) => v + 1)}
                  className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-gray-400 hover:text-gray-900 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  {narrativeStatus === 'error' ? 'RÉESSAYER' : 'RÉGÉNÉRER'}
                </button>
              )}
              <span className="text-[9px] font-bold tracking-[0.2em] text-gray-400 border border-gray-200 px-2.5 py-1.5 rounded-lg hidden sm:inline">
                EY AI ENGINE
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            {aiActive ? (
              'Analyse en cours…'
            ) : (
              <span className="font-semibold text-gray-900 border-b-2 border-[#FFE600] pb-0.5">
                Synthèse exécutive de l’évaluation
              </span>
            )}
          </p>

          {narrativeStatus === 'loading' && (
            <div className="space-y-3.5 py-2">
              {[92, 100, 70, 55].map((w, i) => (
                <div key={w} className="h-2.5 bg-gray-100 rounded-full overflow-hidden relative" style={{ width: `${w}%` }}>
                  <motion.div
                    className="absolute inset-y-0 left-0 w-1/3 bg-gray-200/80 rounded-full"
                    animate={{ x: ['-100%', '250%'] }}
                    transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
                  />
                </div>
              ))}
            </div>
          )}

          {narrativeStatus === 'error' && (
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <p className="text-sm text-gray-400 max-w-sm">
                L'analyse IA est momentanément indisponible. Réessayez dans quelques instants.
              </p>
              <button
                onClick={() => setNarrativeVersion((v) => v + 1)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Réessayer maintenant
              </button>
            </div>
          )}

          {(narrativeStatus === 'streaming' || narrativeStatus === 'done') && narrative && (
            <p className="text-sm text-gray-600 leading-relaxed">
              {narrativeStatus === 'streaming' ? streamText : narrative}
              {narrativeStatus === 'streaming' && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.55, repeat: Infinity }}
                  className="inline-block w-[2px] h-[14px] bg-gray-400 ml-0.5 align-middle"
                />
              )}
            </p>
          )}

          {narrativeStatus === 'done' && (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-4 border-t border-gray-100">
              <p className="text-[10px] text-gray-400">
                Générée par EY AI Engine · Cette analyse ne se substitue pas à un audit conduit par les équipes EY.
              </p>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 shrink-0">
                <Check className="w-3 h-3" /> Analyse finalisée
              </div>
            </div>
          )}
        </motion.div>

        {/* ── NEXT STEPS ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          <p className="text-[10px] font-bold tracking-[0.2em] text-gray-400 mb-5">
            PROCHAINES ÉTAPES
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Target,
                title: "Plan d'action & Recommandations",
                desc: 'Actions priorisées et personnalisées pour progresser sur chaque axe de maturité.',
                label: 'Consulter le plan',
                action: () => navigate(`/recommendations/${result.id}`),
              },
              {
                icon: History,
                title: 'Historique des évaluations',
                desc: 'Retrouvez vos évaluations passées et suivez votre progression dans le temps.',
                label: "Voir l'historique",
                action: () => navigate('/historique'),
              },
              {
                icon: BarChart3,
                title: 'Tableau de bord',
                desc: "Vue consolidée des évaluations de votre banque : profil par dimension et progression dans le temps.",
                label: 'Accéder au tableau de bord',
                action: () => navigate('/dashboard'),
              },
            ].map((card) => (
              <button
                key={card.title}
                onClick={card.action}
                className="group bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 hover:border-gray-300 hover:shadow-md transition-all duration-200 text-left flex flex-col gap-5"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-100 group-hover:bg-[#FFE600] flex items-center justify-center shrink-0 transition-colors duration-200">
                  <card.icon className="w-5 h-5 text-gray-500 group-hover:text-[#1C1C1E] transition-colors duration-200" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 mb-2">{card.title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{card.desc}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 group-hover:text-gray-800 transition-colors duration-200">
                  {card.label}
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        </motion.div>

      </main>
    </div>
  );
}
