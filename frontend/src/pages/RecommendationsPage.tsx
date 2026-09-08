import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  Zap, Building2, ShieldCheck, TrendingUp, ArrowUpRight,
  ChevronDown, CheckCircle2, Loader2, Download, BarChart2,
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { FlowHeader } from '../components/FlowHeader';
import { getRecommendations, getNarrative } from '../lib/recommendations';
import type { RecommendationOut } from '../lib/recommendations';
import { getDimensions } from '../lib/config';
import { downloadRecommendationsReport } from '../lib/reports';

const EFFORT_META: Record<number, { label: string; color: string }> = {
  1: { label: 'Effort faible', color: '#2E7D32' },
  2: { label: 'Effort moyen', color: '#E65100' },
  3: { label: 'Effort élevé', color: '#d4183d' },
};

const CATEGORY_LABELS: Record<string, string> = {
  strategie: 'Stratégie',
  gouvernance: 'Gouvernance',
  qualite: 'Qualité',
  architecture: 'Architecture',
  securite: 'Sécurité',
  analytique: 'Analytique',
  competences: 'Compétences',
  process: 'Process',
};

type EffortFilter = 'all' | 1 | 2 | 3;

const EFFORT_FILTERS: { value: EffortFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 1, label: 'Effort faible' },
  { value: 2, label: 'Effort moyen' },
  { value: 3, label: 'Effort élevé' },
];

/** A recommendation with effort 1 (low) is treated as a "quick win"; 2-3 as a structural initiative. */
const isQuickWin = (effort: number) => effort === 1;

/**
 * Five-node rail for the 1-5 maturity scale: solid nodes mark levels the
 * bank already holds, the amber node/segment marks the step this specific
 * recommendation delivers, hollow nodes mark levels still ahead.
 */
function MaturityRail({ trigger, target }: { trigger: number; target: number }) {
  const levels = [1, 2, 3, 4, 5];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center">
        {levels.map((level, i) => {
          const isAchieved = level < trigger;
          const isCurrent = level === trigger;
          const isTarget = level === target;
          const nodeColor = isTarget
            ? 'bg-[#FFE600] border-[#1A1A1A]'
            : isAchieved || isCurrent
            ? 'bg-[#1A1A1A] border-[#1A1A1A]'
            : 'bg-white border-black/15';
          return (
            <div key={level} className="flex items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full border shrink-0 ${nodeColor}`}
                title={`Niveau ${level}`}
              />
              {i < levels.length - 1 && (
                <div
                  className={`w-3 sm:w-4 h-[2px] ${
                    level < trigger
                      ? 'bg-[#1A1A1A]'
                      : level === trigger
                      ? 'bg-[#FFE600]'
                      : 'bg-black/10'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <span className="text-[9px] tracking-widest text-black/50 uppercase font-mono">
        Niveau {trigger} → {target}
      </span>
    </div>
  );
}

// --- MAIN COMPONENT ---
export function RecommendationsPage() {
  const navigate = useNavigate();
  const assessmentId = Number(useParams().assessmentId);

  const [recommendations, setRecommendations] = useState<RecommendationOut[]>([]);
  const [dimensionNames, setDimensionNames] = useState<Record<number, string>>({});
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [effortFilter, setEffortFilter] = useState<EffortFilter>('all');
  const [completedCodes, setCompletedCodes] = useState<string[]>([]);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(assessmentId)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([getRecommendations(assessmentId), getDimensions()])
      .then(([plan, dims]) => {
        if (cancelled) return;
        setRecommendations(plan.plan_prioritaire);
        const names: Record<number, string> = {};
        for (const d of dims) names[d.id] = d.name;
        setDimensionNames(names);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));

    // The executive synthesis is a secondary enhancement, its failure
    // shouldn't block the (essential) recommendations list from rendering.
    getNarrative(assessmentId)
      .then((res) => !cancelled && setNarrative(res.narrative))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  // The recommendations call can take several minutes (each of the top
  // items gets a real, local LLM reformulation on CPU), a bare spinner
  // reads as broken past ~10s, so this surfaces elapsed time and updates
  // the message in stages to keep the wait legible.
  useEffect(() => {
    if (!loading) {
      setLoadingSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [loading]);

  const loadingMessage =
    loadingSeconds < 10
      ? 'Calcul des recommandations…'
      : loadingSeconds < 30
      ? 'Analyse de votre profil de maturité…'
      : "Génération des reformulations par IA locale, cela peut prendre plusieurs minutes sur ce modèle…";

  const toggleComplete = (code: string) => {
    setCompletedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const filteredRecommendations = useMemo(
    () =>
      effortFilter === 'all'
        ? recommendations
        : recommendations.filter((r) => r.effort === effortFilter),
    [recommendations, effortFilter]
  );

  const lowEffortCount = recommendations.filter((r) => r.effort === 1).length;
  const structurantCount = recommendations.length - lowEffortCount;
  const regulatoryCount = recommendations.filter((r) => r.regulatory_flag).length;

  if (!assessmentId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-4 px-6 text-center py-32">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Aucune évaluation sélectionnée. Complétez une évaluation pour obtenir vos recommandations.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 text-sm font-bold rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Démarrer une évaluation
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-3 text-gray-400 py-32 px-6 text-center">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium max-w-sm">{loadingMessage}</span>
          {loadingSeconds >= 10 && (
            <span className="text-xs tabular-nums text-gray-300">
              {Math.floor(loadingSeconds / 60)}:{String(loadingSeconds % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center gap-4 px-6 text-center py-32">
          <p className="text-sm font-medium text-gray-600 max-w-md">
            Impossible de charger les recommandations. Vérifiez que l'API est démarrée, puis réessayez.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 text-sm font-bold rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* ── Page actions ── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-6 space-y-4">
        <FlowHeader current="Plan d'action" />
        <div className="flex items-center justify-end">
        <button
          onClick={() => toast.promise(downloadRecommendationsReport(assessmentId), {
            loading: 'Génération du rapport PDF…',
            success: 'Rapport PDF téléchargé',
            error: 'Échec du téléchargement du rapport PDF',
          })}
          className="flex items-center gap-1.5 text-xs font-semibold border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors px-3 py-2 rounded-lg"
        >
          <Download className="w-3.5 h-3.5" /> Exporter PDF
        </button>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="bg-white border-b border-gray-200 mt-2">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div>
              <p className="text-[10px] font-bold tracking-[0.25em] text-gray-400 mb-3">
                PLAN D'ACTION, RÉF. DOSSIER #{assessmentId}
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight leading-tight mb-3">
                Recommandations <span className="text-gray-400 font-light">priorisées</span>
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed max-w-lg">
                {recommendations.length} initiative{recommendations.length > 1 ? 's' : ''} priorisée{recommendations.length > 1 ? 's' : ''} pour
                accélérer votre transformation data et atteindre la conformité BCT.
              </p>

              {/* Executive synthesis, the LLM-authored narrative of the bank's
                  results, set off with a left rule to read as written counsel
                  rather than interface copy. */}
              {narrative && (
                <p
                  className="mt-5 max-w-xl text-sm sm:text-base text-gray-700 leading-relaxed border-l-2 border-[#FFE600] pl-4"
                >
                  {narrative}
                </p>
              )}

              {regulatoryCount > 0 && (
                <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-gray-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0277BD]" />
                  {regulatoryCount} obligation{regulatoryCount > 1 ? 's' : ''} réglementaire{regulatoryCount > 1 ? 's' : ''} identifiée{regulatoryCount > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* KPI strip */}
            <div className="flex items-stretch gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden shrink-0">
              {[
                { val: recommendations.length, label: 'Initiatives', sub: 'au total' },
                { val: lowEffortCount, label: 'Quick Wins', sub: 'effort faible', accent: true },
                { val: structurantCount, label: 'Structurants', sub: 'effort moyen/élevé' },
              ].map((k) => (
                <div
                  key={k.label}
                  className={`px-7 py-5 flex flex-col items-center gap-0.5 ${k.accent ? 'bg-[#FFE600]' : 'bg-white'}`}
                >
                  <span className={`text-3xl font-bold leading-none ${k.accent ? 'text-black' : 'text-gray-900'}`}>{k.val}</span>
                  <span className={`text-[11px] font-semibold ${k.accent ? 'text-black/70' : 'text-gray-700'}`}>{k.label}</span>
                  <span className={`text-[10px] ${k.accent ? 'text-black/50' : 'text-gray-400'}`}>{k.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8">

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-6 w-fit overflow-x-auto">
          {EFFORT_FILTERS.map((f) => {
            const count =
              f.value === 'all' ? recommendations.length : recommendations.filter((r) => r.effort === f.value).length;
            return (
              <button
                key={f.value}
                onClick={() => setEffortFilter(f.value)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap transition-all duration-150 ${
                  effortFilter === f.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {f.label} <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* ── List ── */}
        {filteredRecommendations.length === 0 ? (
          <div className="p-10 text-center border border-gray-200 rounded-xl bg-white text-sm text-gray-500">
            {recommendations.length === 0
              ? "Aucune recommandation : votre niveau de maturité est déjà optimal sur l'ensemble des dimensions évaluées."
              : 'Aucune recommandation ne correspond à ce filtre.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRecommendations.map((rec, index) => {
              const isQW = isQuickWin(rec.effort);
              const isOpen = expandedCode === rec.code;
              const isCompleted = completedCodes.includes(rec.code);
              const isTopPriority = rec.rank === 1;
              const dimensionLabel =
                dimensionNames[rec.dimension_id] ?? CATEGORY_LABELS[rec.category] ?? rec.category;
              const effortMeta = EFFORT_META[rec.effort];

              return (
                <motion.div
                  key={rec.code}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.04 }}
                  className={`bg-white border rounded-xl overflow-hidden ${
                    isTopPriority ? 'border-gray-200 border-l-4 border-l-[#FFE600]' : 'border-gray-200'
                  }`}
                >
                  {/* Collapsed row */}
                  <button onClick={() => setExpandedCode(isOpen ? null : rec.code)} className="w-full text-left">
                    <div className="flex items-center gap-5 px-6 py-5 hover:bg-gray-50/70 transition-colors">
                      <div
                        className="w-0.5 h-10 rounded-full flex-shrink-0"
                        style={{ backgroundColor: isQW ? '#FFE600' : '#cbd5e1' }}
                      />

                      <span className="text-xl font-bold font-mono text-gray-200 w-8 shrink-0 select-none leading-none">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <span className="hidden md:block text-[10px] font-semibold tracking-[0.14em] text-gray-400 border border-gray-200 px-2 py-0.5 rounded whitespace-nowrap shrink-0 w-28 text-center truncate">
                        {dimensionLabel.split(' ')[0].toUpperCase()}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className={`flex items-center gap-2 ${isCompleted ? 'opacity-50' : ''}`}>
                          <p className={`text-sm font-semibold truncate ${isCompleted ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {rec.title}
                          </p>
                          {isTopPriority && (
                            <span className="shrink-0 inline-flex items-center text-[9px] font-bold tracking-widest uppercase bg-[#FFE600] text-black px-1.5 py-0.5 rounded">
                              #1
                            </span>
                          )}
                          {rec.regulatory_flag && (
                            <ShieldCheck className="w-3.5 h-3.5 text-[#0277BD] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-1 hidden sm:block leading-relaxed">
                          {rec.texte_reformule}
                        </p>
                      </div>

                      <div className="hidden lg:flex items-center gap-3 shrink-0">
                        <span
                          className="text-[11px] font-bold whitespace-nowrap w-24 text-right"
                          style={{ color: effortMeta.color }}
                        >
                          {effortMeta.label}
                        </span>
                        {isQW ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold bg-[#FFE600] text-black px-2.5 py-1 rounded-md w-24 justify-center">
                            <Zap className="w-3 h-3" />Quick Win
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-semibold bg-gray-100 text-gray-500 px-2.5 py-1 rounded-md w-24 justify-center">
                            <Building2 className="w-3 h-3" />Structurant
                          </span>
                        )}
                      </div>

                      <ChevronDown className={`w-4 h-4 text-gray-300 shrink-0 transition-transform duration-200 ml-1 ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                          {/* Meta row: code · dimension · traité toggle */}
                          <div className="flex flex-wrap items-center justify-between gap-3 my-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase font-mono">
                                {rec.code}
                              </span>
                              <span className="text-gray-300">·</span>
                              <span className="text-[10px] tracking-widest text-gray-500 uppercase font-mono">
                                {dimensionLabel}
                              </span>
                            </div>
                            <button
                              onClick={() => toggleComplete(rec.code)}
                              className={`flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md border transition-colors ${
                                isCompleted
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {isCompleted ? 'Traité' : 'À traiter'}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6">
                            {/* Description + reasoning */}
                            <div className="sm:pt-1 space-y-5">
                              <MaturityRail trigger={rec.trigger_level} target={rec.target_level} />

                              <div>
                                <p className="text-[10px] font-bold tracking-[0.16em] text-gray-400 mb-2">DESCRIPTION</p>
                                <p className="text-sm text-gray-700 leading-relaxed">
                                  {rec.texte_reformule}
                                </p>
                              </div>

                              <div>
                                <p className="text-[10px] font-bold tracking-[0.16em] text-gray-400 mb-2">POURQUOI CETTE PRIORITÉ</p>
                                <p className="text-sm italic text-gray-600 leading-relaxed">
                                  {rec.justification}
                                </p>
                              </div>

                              {rec.explanation_factors.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold tracking-[0.16em] text-gray-400 mb-3">FACTEURS EXPLICATIFS</p>
                                  <div className="space-y-2.5">
                                    {rec.explanation_factors.map((f) => (
                                      <div key={f.feature} className="flex items-start gap-3">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                          f.direction === 'positif' ? 'bg-emerald-50' : 'bg-red-50'
                                        }`}>
                                          {f.direction === 'positif' ? (
                                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                                          ) : (
                                            <ArrowUpRight className="w-3.5 h-3.5 text-red-500 rotate-90" />
                                          )}
                                        </div>
                                        <span className="text-xs text-gray-700 leading-relaxed">{f.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Facts panel -- score and rank dropped: both just restate
                                what the collapsed row already showed (its position in
                                the list, sorted by that same score), so expanding the
                                card added nothing here that wasn't already on screen. */}
                            <div className="bg-gray-50 rounded-xl p-5 space-y-4 border border-gray-100 h-fit">
                              <div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                                  <Building2 className="w-3.5 h-3.5" /> Dimension
                                </div>
                                <span className="text-xs font-semibold text-gray-800 leading-snug">{dimensionLabel}</span>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                                    <BarChart2 className="w-3.5 h-3.5" /> Effort
                                  </div>
                                  <span className="text-xs font-semibold text-gray-800">{effortMeta.label}</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                                    <Zap className="w-3.5 h-3.5" /> Priorité
                                  </div>
                                  <span className="text-xs font-semibold text-gray-800">{isQW ? 'Quick Win' : 'Structurant'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
