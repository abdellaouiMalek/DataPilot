import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, ChevronRight, Target, BarChart3, Settings2, Loader2 } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { getMaturityLevels } from '../lib/config';
import type { MaturityLevel } from '../lib/config';

export function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { answers = {} } = location.state || {};

  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMaturityLevels()
      .then((data) => !cancelled && setMaturityLevels(data))
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

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

  const calculateDimensionScore = (dimensionId: string) => {
    const dimAnswers = answers[dimensionId] || {};
    const values = Object.values(dimAnswers) as number[];
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  };

  const scores = {
    gouvernance: calculateDimensionScore('gouvernance'),
    qualite: calculateDimensionScore('qualite'),
    architecture: calculateDimensionScore('architecture'),
    usage: calculateDimensionScore('usage'),
    culture: calculateDimensionScore('culture'),
    strategie: calculateDimensionScore('strategie'),
  };

  const isMock = Object.values(scores).every(score => score === 0);
  const displayScores = isMock ? {
    gouvernance: 1.9,
    qualite: 2.8,
    architecture: 3.5,
    usage: 2.4,
    culture: 4.5,
    strategie: 3.1
  } : scores;

  const globalScore = Object.values(displayScores).reduce((sum, val) => sum + val, 0) / 6;

  const getMaturityLevel = (score: number) => {
    return maturityLevels.find((level) => score >= level.min_score && score <= level.max_score) || maturityLevels[0];
  };

  const maturity = getMaturityLevel(globalScore);

  const radarData = [
    { dimension: 'Gouvernance', value: displayScores.gouvernance, fullMark: 5 },
    { dimension: 'Qualité', value: displayScores.qualite, fullMark: 5 },
    { dimension: 'Architecture', value: displayScores.architecture, fullMark: 5 },
    { dimension: 'Usage', value: displayScores.usage, fullMark: 5 },
    { dimension: 'Culture', value: displayScores.culture, fullMark: 5 },
    { dimension: 'Stratégie', value: displayScores.strategie, fullMark: 5 },
  ];

  const insights = {
    strengths: Object.entries(displayScores)
      .filter(([, score]) => score >= 3.5)
      .map(([dim]) => dim),
    weaknesses: Object.entries(displayScores)
      .filter(([, score]) => score < 3)
      .map(([dim]) => dim),
  };

  const dimensionLabels: Record<string, string> = {
    gouvernance: 'Gouvernance des données',
    qualite: 'Qualité des données',
    architecture: 'Architecture & Infra',
    usage: 'Usage & Analytics',
    culture: 'Culture Data & Compétences',
    strategie: 'Stratégie & Vision Data',
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans antialiased overflow-x-hidden">
      <Navbar />

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 sm:py-16 space-y-8 sm:space-y-16">
        {/* Global Banner and Dimension Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white border border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Score Summary Banner */}
            <div className="lg:col-span-7 p-6 sm:p-12 lg:p-16 border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-900 text-white relative">
              <div className="absolute top-0 right-0 w-48 h-48 sm:w-64 h-64 bg-[#FFE600]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />

              <div className="relative z-10 space-y-6 sm:space-y-10">
                <div className="inline-flex items-center gap-3 px-3 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20">
                  <span className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-300">
                    DATE :
                  </span>
                  <span className="text-[10px] sm:text-xs font-bold text-white uppercase">
                    {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>

                <div className="space-y-2 sm:space-y-4">
                  <h1 className="text-sm sm:text-xl font-light text-gray-400 tracking-wide">
                    Niveau de maturité global
                  </h1>
                  <div className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight">
                    {maturity.label}
                  </div>
                  <p className="text-sm sm:text-lg text-gray-400 max-w-xl font-light leading-relaxed">
                    {maturity.description}
                  </p>
                </div>

                <div className="pt-6 sm:pt-8 border-t border-gray-800">
                  <div className="text-[10px] sm:text-xs font-bold tracking-widest text-gray-500 mb-1 sm:mb-2">SCORE CONSOLIDÉ</div>
                  <div className="flex items-baseline gap-2 sm:gap-4">
                    <div className="text-5xl sm:text-7xl font-light tracking-tighter text-[#FFE600]">
                      {globalScore.toFixed(1)}
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-gray-600">/ 5.0</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bars Detail */}
            <div className="lg:col-span-5 p-6 sm:p-12 lg:p-16 bg-white">
              <div className="space-y-6 sm:space-y-8">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                  <Target className="w-5 h-5 text-[#FFE600] flex-shrink-0" />
                  <div className="text-xs sm:text-sm font-bold tracking-widest text-gray-800">DÉTAIL PAR DIMENSION</div>
                </div>

                <div className="space-y-4 sm:space-y-6">
                  {Object.entries(displayScores).map(([dim, score]) => (
                    <div key={dim} className="space-y-1.5 sm:space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs sm:text-sm font-bold text-gray-600 truncate">{dimensionLabels[dim]}</span>
                        <span className="text-sm sm:text-lg font-bold text-gray-900 flex-shrink-0">
                          {score.toFixed(1)}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 relative overflow-hidden rounded-full">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(score / 5) * 100}%` }}
                          transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                          className="absolute inset-y-0 left-0"
                          style={{
                            backgroundColor: score >= 4.5 ? '#7dd3fc' : score >= 3.5 ? '#86efac' : score >= 3.0 ? '#fef08a' : score >= 2.0 ? '#fb923c' : '#f87171',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Charts & Insights Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8"
        >
          {/* Radar Chart Container */}
          <div className="lg:col-span-7 bg-white border border-gray-200 shadow-sm p-4 sm:p-10 flex flex-col justify-center min-h-[350px] sm:min-h-[500px]">
            <div className="text-center mb-4 sm:mb-8">
              <h3 className="text-lg sm:text-2xl font-light text-gray-900 tracking-tight">Empreinte de maturité</h3>
              <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">Distribution des scores sur les 6 axes d'analyse</p>
            </div>

            <div className="flex-1 w-full relative min-h-[250px] sm:min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fill: '#374151', fontSize: window.innerWidth < 640 ? 10 : 12, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <Radar
                    name="Votre Score"
                    dataKey="value"
                    stroke="#111827"
                    strokeWidth={2}
                    fill="#FFE600"
                    fillOpacity={0.35}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Text Insights Card */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-white border border-gray-200 shadow-sm p-6 sm:p-10 flex-1">
              <div className="space-y-2 sm:space-y-4 mb-6 sm:mb-8 border-b border-gray-100 pb-6">
                <h3 className="text-lg sm:text-2xl font-light text-gray-900 tracking-tight">
                  Analyse des résultats
                </h3>
                <p className="text-gray-500 text-xs sm:text-sm leading-relaxed font-medium">
                  Synthèse de vos forces et des axes prioritaires nécessitant une intervention stratégique.
                </p>
              </div>

              <div className="space-y-6 sm:space-y-8">
                {insights.strengths.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1.5 border-l-2 border-emerald-500 inline-flex">
                      <TrendingUp className="w-3.5 h-3.5" />
                      POINTS FORTS
                    </div>
                    <div className="space-y-2.5 pl-1">
                      {insights.strengths.map((dim) => (
                        <div key={dim} className="flex items-center justify-between gap-4 text-xs sm:text-sm">
                          <span className="font-semibold text-gray-800 truncate">{dimensionLabels[dim]}</span>
                          <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-sm flex-shrink-0">
                            {displayScores[dim as keyof typeof displayScores].toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {insights.weaknesses.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold tracking-widest text-red-600 bg-red-50 px-2.5 py-1.5 border-l-2 border-red-500 inline-flex">
                      <TrendingDown className="w-3.5 h-3.5" />
                      AXES PRIORITAIRES
                    </div>
                    <div className="space-y-2.5 pl-1">
                      {insights.weaknesses.map((dim) => (
                        <div key={dim} className="flex items-center justify-between gap-4 text-xs sm:text-sm">
                          <span className="font-semibold text-gray-800 truncate">{dimensionLabels[dim]}</span>
                          <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-sm flex-shrink-0">
                            {displayScores[dim as keyof typeof displayScores].toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {insights.strengths.length === 0 && insights.weaknesses.length === 0 && (
                  <div className="p-4 sm:p-6 bg-gray-50 border border-gray-200 text-center text-xs sm:text-sm text-gray-500 font-medium">
                    Vos scores sont équilibrés sur l'ensemble des dimensions de maturité.
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Recommended Steps Block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="border-t border-gray-200 pt-8 sm:pt-16"
        >
          <div className="space-y-6 sm:space-y-10">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-8 h-8 bg-black flex items-center justify-center flex-shrink-0">
                <ChevronRight className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl sm:text-3xl font-light tracking-tight text-gray-900">
                Prochaines étapes recommandées
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:grid-cols-1 lg:gap-6">
              {/* Card 1 */}
              <button
                onClick={() => navigate('/recommendations', { state: { scores: displayScores, maturity } })}
                className="bg-white border border-gray-200 p-6 sm:p-8 hover:border-black hover:shadow-lg transition-all group text-left flex flex-col h-full relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-0 bg-black group-hover:h-full transition-all duration-300" />
                <div className="space-y-4 sm:space-y-6 flex-1">
                  <div className="p-2.5 bg-gray-50 inline-block text-gray-800 group-hover:bg-[#FFE600] group-hover:text-black transition-colors">
                    <Target className="w-5 h-5 sm:w-6 h-6" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-base sm:text-lg font-bold text-gray-900">Plan d'action & Recommandations</h4>
                    <p className="text-xs sm:text-sm text-gray-500 leading-relaxed font-medium">
                      Découvrez les actions priorisées et personnalisées pour améliorer votre maturité sur chaque axe.
                    </p>
                  </div>
                </div>
                <div className="pt-6 sm:pt-8 flex items-center text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 group-hover:text-black transition-colors uppercase mt-auto">
                  Consulter le plan <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </div>
              </button>

              {/* Card 2 */}
              <button
                onClick={() => navigate('/simulation', { state: { scores: displayScores } })}
                className="bg-white border border-gray-200 p-6 sm:p-8 hover:border-black hover:shadow-lg transition-all group text-left flex flex-col h-full relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-0 bg-black group-hover:h-full transition-all duration-300" />
                <div className="space-y-4 sm:space-y-6 flex-1">
                  <div className="p-2.5 bg-gray-50 inline-block text-gray-800 group-hover:bg-[#FFE600] group-hover:text-black transition-colors">
                    <Settings2 className="w-5 h-5 sm:w-6 h-6" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-base sm:text-lg font-bold text-gray-900">Simulateur d'impact</h4>
                    <p className="text-xs sm:text-sm text-gray-500 leading-relaxed font-medium">
                      Modélisez virtuellement les gains potentiels de maturité en ajustant vos investissements stratégiques.
                    </p>
                  </div>
                </div>
                <div className="pt-6 sm:pt-8 flex items-center text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 group-hover:text-black transition-colors uppercase mt-auto">
                  Lancer la simulation <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </div>
              </button>

              {/* Card 3 */}
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-white border border-gray-200 p-6 sm:p-8 hover:border-black hover:shadow-lg transition-all group text-left flex flex-col h-full relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-0 bg-black group-hover:h-full transition-all duration-300" />
                <div className="space-y-4 sm:space-y-6 flex-1">
                  <div className="p-2.5 bg-gray-50 inline-block text-gray-800 group-hover:bg-[#FFE600] group-hover:text-black transition-colors">
                    <BarChart3 className="w-5 h-5 sm:w-6 h-6" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-base sm:text-lg font-bold text-gray-900">Dashboard Management</h4>
                    <p className="text-xs sm:text-sm text-gray-500 leading-relaxed font-medium">
                      Accédez à la vue consolidée, suivez l'évolution historique et comparez-vous au benchmark du marché.
                    </p>
                  </div>
                </div>
                <div className="pt-6 sm:pt-8 flex items-center text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 group-hover:text-black transition-colors uppercase mt-auto">
                  Accéder au Dashboard <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </div>
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}