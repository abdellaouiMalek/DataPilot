import { useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Navbar } from '../components/Navbar';
import {
  Zap,
  Building,
  Clock,
  Shield,
  TrendingUp,
  ChevronRight,
  CheckCircle2,
  Circle,
} from 'lucide-react';

// --- INTERFACES & MOCKS ---
interface Recommendation {
  id: number;
  priority: 'quick-win' | 'structurant';
  dimension: string;
  title: string;
  description: string;
  timeline: string;
  impact: string;
  effort: string;
  businessValue: {
    risk: string;
    time: string;
    compliance: string;
  };
}

const recommendations: Recommendation[] = [
  {
    id: 1,
    priority: 'quick-win',
    dimension: 'Sécurité & Infrastructure',
    title: 'Optimisation de la configuration Redis et Kafka',
    description: 'Mise en place de politiques de rétention strictes et isolation des clusters de messagerie pour éliminer la latence sur les services transactionnels.',
    timeline: '2 semaines',
    impact: 'Élevé',
    effort: 'Faible',
    businessValue: {
      risk: 'Réduction des goulots d\'étranglement de 40%',
      time: 'Gain immédiat sur les temps de réponse API',
      compliance: 'Alignement avec les SLAs de production'
    }
  },
  {
    id: 2,
    priority: 'structurant',
    dimension: 'Architecture Cloud',
    title: 'Déploiement du cluster Kubernetes sur cloud privé OpenStack',
    description: 'Migration et orchestration complète des microservices vers l\'infrastructure interne pour une résilience accrue et un meilleur contrôle des coûts.',
    timeline: '2 mois',
    impact: 'Critique',
    effort: 'Élevé',
    businessValue: {
      risk: 'Souveraineté totale des données sensibles',
      time: 'CI/CD automatisé et scalabilité horizontale',
      compliance: 'Conformité renforcée aux standards d\'audit'
    }
  }
];

function generateSimulatedRecommendations(currentScores: any, targetScores: any): Recommendation[] {
  return recommendations.map(rec => ({
    ...rec,
    title: `[Simulé] ${rec.title}`,
    description: `Ajusté selon l'écart de score ciblé (${currentScores.infra || 0} → ${targetScores.infra || 5}). ${rec.description}`
  }));
}

// --- MAIN COMPONENT ---
export function RecommendationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedPriority, setSelectedPriority] = useState<'all' | 'quick-win' | 'structurant'>('all');
  const [completedIds, setCompletedIds] = useState<number[]>([]);

  const isSimulation = location.state?.isSimulation;
  const currentScores = location.state?.scores || {};
  const targetScores = location.state?.targetScores || {};

  const activeRecommendations = useMemo(() => {
    return isSimulation
      ? generateSimulatedRecommendations(currentScores, targetScores)
      : recommendations;
  }, [isSimulation, currentScores, targetScores]);

  const filteredRecommendations =
    selectedPriority === 'all'
      ? activeRecommendations
      : activeRecommendations.filter((r) => r.priority === selectedPriority);

  const quickWins = activeRecommendations.filter((r) => r.priority === 'quick-win');
  const structurants = activeRecommendations.filter((r) => r.priority === 'structurant');

  const pageDescription = isSimulation
    ? `Ces ${activeRecommendations.length} recommandations sont générées dynamiquement pour vous aider à atteindre la cible que vous venez de simuler.`
    : `${activeRecommendations.length} recommandations priorisées pour accélérer votre transformation et générer de la valeur business mesurable.`;

  const toggleComplete = (id: number) => {
    setCompletedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-16">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8 sm:mb-16"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-16">
            <div className="lg:col-span-7 space-y-3 sm:space-y-4">
              <h1 className="text-3xl sm:text-6xl font-light leading-tight text-black">
                Plan d'action
                <br />
                <span className="relative inline-block font-normal">
                  {isSimulation ? 'simulé' : 'stratégique'}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 0.8, delay: 0.5 }}
                    className="absolute -bottom-1 left-0 h-1.5 sm:h-2 bg-[#FFE600] -z-10"
                  />
                </span>
              </h1>
              <p className="text-xs sm:text-base md:text-lg text-black/70 max-w-xl">
                {pageDescription}
              </p>
            </div>

            {/* KPI Cards */}
            <div className="lg:col-span-5 grid grid-cols-2 gap-3">
              <div className="border border-black/5 bg-[#fafafa] p-4 space-y-2">
                <Zap className="w-5 h-5 text-[#FFE600]" />
                <div className="text-xl sm:text-3xl font-light">{quickWins.length}</div>
                <div className="text-[11px] sm:text-xs text-black/60">Quick Wins</div>
              </div>
              <div className="border border-black/5 bg-[#fafafa] p-4 space-y-2">
                <Building className="w-5 h-5 text-black" />
                <div className="text-xl sm:text-3xl font-light">{structurants.length}</div>
                <div className="text-[11px] sm:text-xs text-black/60">Projets Structurants</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Filters - Mobile Scrollable Bar */}
        <div className="mb-6 sm:mb-10 flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
          <button
            onClick={() => setSelectedPriority('all')}
            className={`whitespace-nowrap px-4 py-2 border text-xs sm:text-sm transition-all ${
              selectedPriority === 'all'
                ? 'border-black bg-black text-white'
                : 'border-black/10 bg-white text-black hover:border-black/30'
            }`}
          >
            Toutes ({activeRecommendations.length})
          </button>
          <button
            onClick={() => setSelectedPriority('quick-win')}
            className={`whitespace-nowrap px-4 py-2 border text-xs sm:text-sm transition-all flex items-center gap-2 ${
              selectedPriority === 'quick-win'
                ? 'border-[#FFE600] bg-[#FFE600] text-black'
                : 'border-black/10 bg-white text-black hover:border-black/30'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Quick Wins ({quickWins.length})
          </button>
          <button
            onClick={() => setSelectedPriority('structurant')}
            className={`whitespace-nowrap px-4 py-2 border text-xs sm:text-sm transition-all flex items-center gap-2 ${
              selectedPriority === 'structurant'
                ? 'border-black bg-black text-white'
                : 'border-black/10 bg-white text-black hover:border-black/30'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            Structurants ({structurants.length})
          </button>
        </div>

        {/* Recommendations List */}
        <div className="space-y-4">
          {filteredRecommendations.map((rec, index) => {
            const isCompleted = completedIds.includes(rec.id);

            return (
              <motion.div
                key={rec.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.04 }}
                className={`border transition-all ${
                  isCompleted
                    ? 'border-black/10 bg-black/5'
                    : rec.priority === 'quick-win'
                    ? 'border-[#FFE600]/30 bg-[#FFE600]/5 hover:border-[#FFE600]'
                    : 'border-black/10 bg-white hover:border-black/30'
                }`}
              >
                <div className="p-4 sm:p-6 md:p-8">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start">
                    
                    {/* Checkbox and Content Wrapper */}
                    <div className="flex gap-3 w-full flex-1">
                      <button
                        onClick={() => toggleComplete(rec.id)}
                        className="flex-shrink-0 w-5 h-5 mt-0.5"
                        aria-label="Marquer comme complété"
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-[#2e8b57]" />
                        ) : (
                          <Circle className="w-5 h-5 text-black/20 hover:text-black/60 transition-colors" />
                        )}
                      </button>

                      <div className="flex-1 space-y-4 min-w-0">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <div className="inline-block border border-black/10 px-2 py-0.5">
                              <span className="text-[9px] tracking-wider text-black/60 font-medium">
                                {rec.dimension.toUpperCase()}
                              </span>
                            </div>
                            {rec.priority === 'quick-win' && (
                              <div className="flex items-center gap-1 bg-[#FFE600] px-2 py-0.5">
                                <Zap className="w-2.5 h-2.5" />
                                <span className="text-[9px] tracking-wider font-semibold">QUICK WIN</span>
                              </div>
                            )}
                          </div>
                          <h3 className={`text-base sm:text-xl md:text-2xl font-light break-words ${isCompleted ? 'line-through text-black/40' : 'text-black'}`}>
                            {rec.title}
                          </h3>
                          <p className={`text-xs sm:text-sm md:text-base text-black/70 leading-relaxed break-words ${isCompleted ? 'opacity-50' : ''}`}>
                            {rec.description}
                          </p>
                        </div>

                        {/* Metadata Grid - Balanced 2 columns on Mobile */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 border-t border-b md:border-b-0 border-black/5 py-3 md:py-0">
                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="w-3.5 h-3.5 text-black/40 flex-shrink-0" />
                            <span className="text-black/60">Durée :</span>
                            <span className="font-medium truncate">{rec.timeline}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <TrendingUp className="w-3.5 h-3.5 text-black/40 flex-shrink-0" />
                            <span className="text-black/60">Impact :</span>
                            <span className="font-medium truncate">{rec.impact}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs col-span-2 md:col-span-1">
                            <Building className="w-3.5 h-3.5 text-black/40 flex-shrink-0" />
                            <span className="text-black/60">Effort :</span>
                            <span className="font-medium truncate">{rec.effort}</span>
                          </div>
                        </div>

                        {/* Business Value Section - Card/List block stacked on mobile */}
                        <div className="md:border-t md:border-black/5 md:pt-4 space-y-2">
                          <div className="text-[9px] tracking-wider text-black/60 font-semibold">VALEUR BUSINESS</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            <div className="flex items-start gap-2 bg-black/[0.02] md:bg-transparent p-2 md:p-0 rounded">
                              <Shield className="w-3.5 h-3.5 text-[#FFE600] flex-shrink-0 mt-0.5" />
                              <div className="text-xs text-black/70 break-words">{rec.businessValue.risk}</div>
                            </div>
                            <div className="flex items-start gap-2 bg-black/[0.02] md:bg-transparent p-2 md:p-0 rounded">
                              <Clock className="w-3.5 h-3.5 text-[#FFE600] flex-shrink-0 mt-0.5" />
                              <div className="text-xs text-black/70 break-words">{rec.businessValue.time}</div>
                            </div>
                            <div className="flex items-start gap-2 bg-black/[0.02] md:bg-transparent p-2 md:p-0 rounded sm:col-span-2 md:col-span-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#FFE600] flex-shrink-0 mt-0.5" />
                              <div className="text-xs text-black/70 break-words">{rec.businessValue.compliance}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button className="w-full md:w-auto flex items-center justify-between md:justify-center px-4 py-2.5 border border-black/10 hover:border-black hover:bg-black hover:text-white transition-all text-xs font-medium mt-1 md:mt-0">
                      <span>Détails</span>
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Roadmap Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-12 sm:mt-20 border-t border-black/5 pt-10"
        >
          <div className="space-y-6">
            <h2 className="text-xl sm:text-3xl font-light">Vue roadmap</h2>
            <div className="relative">
              <div className="hidden md:block absolute top-6 left-0 right-0 h-0.5 bg-black/10" />
              <div className="absolute top-0 bottom-0 left-1.5 w-0.5 bg-black/10 md:hidden" />
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative pl-6 md:pl-0">
                {['Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027'].map((quarter, index) => (
                  <div key={quarter} className="space-y-2 relative">
                    <div className="absolute -left-[22px] top-1.5 md:static w-2.5 h-2.5 bg-[#FFE600] rounded-full z-10" />
                    <div>
                      <span className="text-xs font-semibold tracking-wide text-black/60">{quarter}</span>
                    </div>
                    <div className="space-y-1.5 md:pl-2">
                      {filteredRecommendations
                        .filter((_, i) => i % 4 === index)
                        .map((rec) => (
                          <div key={rec.id} className="text-xs text-black/70 border-l-2 border-black/10 pl-2 py-1 bg-[#fafafa] md:bg-transparent rounded-r truncate">
                            {rec.title}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bottom CTA Block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 border border-black/5 bg-[#fafafa] p-5 sm:p-10"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-lg sm:text-2xl font-light">Prêt à modéliser l'impact ?</h3>
              <p className="text-xs sm:text-base text-black/70">
                Simulez les gains potentiels de ces recommandations sur vos métriques business.
              </p>
            </div>
            <button
              onClick={() => navigate('/simulation')}
              className="w-full lg:w-auto px-5 py-3.5 bg-[#FFE600] hover:bg-[#f5dc00] text-black font-semibold transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm"
            >
              <span>Lancer une simulation</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}