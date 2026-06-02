import { useLocation, useNavigate } from 'react-router-dom';
import eyLogo from '../assets/ey-logo.png';
import { motion } from 'motion/react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, ChevronRight, Download, Share2, Target, BarChart3, Settings2, Check } from 'lucide-react';
import { toast } from 'sonner';

const maturityLevels = [
  { min: 0, max: 1.9, label: 'Initial', color: '#f87171', description: 'Non-conformité BCT probable. Urgence absolue.', bg: 'bg-red-400', text: 'text-red-900' },
  { min: 2.0, max: 2.9, label: 'Reproductible', color: '#fb923c', description: 'Plan de transformation requis immédiatement.', bg: 'bg-orange-400', text: 'text-orange-900' },
  { min: 3.0, max: 3.4, label: 'Défini', color: '#fef08a', description: 'Industrialisation à engager.', bg: 'bg-yellow-200', text: 'text-yellow-900' },
  { min: 3.5, max: 4.4, label: 'Géré', color: '#86efac', description: 'Maturité avancée. Optimisation ciblée.', bg: 'bg-green-300', text: 'text-green-900' },
  { min: 4.5, max: 5.0, label: 'Optimisé', color: '#7dd3fc', description: 'Excellence data-driven. Référence BCT.', bg: 'bg-sky-300', text: 'text-sky-900' },
];

export function ResultsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { answers = {}, profile = {} } = location.state || {};

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
    return maturityLevels.find((level) => score >= level.min && score <= level.max) || maturityLevels[0];
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
    architecture: 'Architecture & Infrastructure',
    usage: 'Usage & Analytics',
    culture: 'Culture Data & Compétences',
    strategie: 'Stratégie & Vision Data',
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-black flex items-center justify-center shadow-sm cursor-pointer" onClick={() => navigate('/')}>
                <img src={eyLogo} alt="EY" className="w-9 h-9 object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-widest text-gray-900">RÉSULTATS D'ÉVALUATION</span>
                <span className="text-xs text-gray-500 tracking-wider">
                  {profile.bank || 'Analyse détaillée'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => toast('Lien copié dans le presse-papiers', { icon: <Check className="w-4 h-4 text-green-500" /> })}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2 text-sm font-bold tracking-wide"
              >
                <Share2 className="w-4 h-4 text-gray-500" />
                PARTAGER
              </button>
              <button
                onClick={() => toast.success('Génération du rapport PDF...', { description: 'Le téléchargement commencera sous peu.' })}
                className="px-5 py-2.5 bg-black text-white hover:bg-gray-900 shadow-md transition-all flex items-center gap-2 text-sm font-bold tracking-wide"
              >
                <Download className="w-4 h-4" />
                TÉLÉCHARGER PDF
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-16 bg-white border border-gray-200 shadow-sm overflow-hidden"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-7 p-12 lg:p-16 border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-900 text-white relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#FFE600]/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />

              <div className="relative z-10 space-y-10">
                <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20">
                  <span className="text-xs font-bold tracking-widest text-gray-300">
                    DATE DE L'ÉVALUATION :
                  </span>
                  <span className="text-xs font-bold text-white uppercase">
                    {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>

                <div className="space-y-4">
                  <h1 className="text-xl md:text-2xl font-light text-gray-400 tracking-wide">
                    Niveau de maturité global
                  </h1>
                  <div className="text-5xl md:text-7xl font-bold tracking-tight">
                    {maturity.label}
                  </div>
                  <p className="text-lg text-gray-400 max-w-xl font-light leading-relaxed">
                    {maturity.description}
                  </p>
                </div>

                <div className="pt-8 border-t border-gray-800">
                  <div className="text-xs font-bold tracking-widest text-gray-500 mb-2">SCORE CONSOLIDÉ</div>
                  <div className="flex items-baseline gap-4">
                    <div className="text-7xl font-light tracking-tighter text-[#FFE600]">
                      {globalScore.toFixed(1)}
                    </div>
                    <div className="text-2xl font-bold text-gray-600">/ 5.0</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 p-12 lg:p-16 bg-white">
              <div className="space-y-8">
                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                  <Target className="w-5 h-5 text-[#FFE600]" />
                  <div className="text-sm font-bold tracking-widest text-gray-800">DÉTAIL PAR DIMENSION</div>
                </div>

                <div className="space-y-6">
                  {Object.entries(displayScores).map(([dim, score]) => (
                    <div key={dim} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-600">{dimensionLabels[dim]}</span>
                        <span className="text-lg font-bold text-gray-900">
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

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-16 grid grid-cols-1 lg:grid-cols-12 gap-8"
        >
          <div className="lg:col-span-7 bg-white border border-gray-200 shadow-sm p-10 h-full flex flex-col justify-center min-h-[500px]">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-light text-gray-900 tracking-tight">Empreinte de maturité</h3>
              <p className="text-sm text-gray-500 font-medium mt-1">Distribution des scores sur les 6 axes d'analyse</p>
            </div>

            <div className="flex-1 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis
                    dataKey="dimension"
                    tick={{ fill: '#374151', fontSize: 13, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <Radar
                    name="Votre Score"
                    dataKey="value"
                    stroke="#111827"
                    strokeWidth={3}
                    fill="#FFE600"
                    fillOpacity={0.4}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-8 flex flex-col h-full">
            <div className="bg-white border border-gray-200 shadow-sm p-10 flex-1">
              <div className="space-y-4 mb-8 border-b border-gray-100 pb-6">
                <h3 className="text-2xl font-light text-gray-900 tracking-tight">
                  Analyse des résultats
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed font-medium">
                  Synthèse de vos forces et des axes prioritaires nécessitant une intervention stratégique.
                </p>
              </div>

              <div className="space-y-8">
                {insights.strengths.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-emerald-600 bg-emerald-50 px-3 py-2 border-l-2 border-emerald-500 inline-flex">
                      <TrendingUp className="w-4 h-4" />
                      POINTS FORTS IDENTIFIÉS
                    </div>
                    <div className="space-y-3 pl-1">
                      {insights.strengths.map((dim) => (
                        <div key={dim} className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-gray-800">{dimensionLabels[dim]}</span>
                          <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-sm">
                            {displayScores[dim as keyof typeof displayScores].toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {insights.weaknesses.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-red-600 bg-red-50 px-3 py-2 border-l-2 border-red-500 inline-flex">
                      <TrendingDown className="w-4 h-4" />
                      AXES D'AMÉLIORATION PRIORITAIRES
                    </div>
                    <div className="space-y-3 pl-1">
                      {insights.weaknesses.map((dim) => (
                        <div key={dim} className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-gray-800">{dimensionLabels[dim]}</span>
                          <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-sm">
                            {displayScores[dim as keyof typeof displayScores].toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {insights.strengths.length === 0 && insights.weaknesses.length === 0 && (
                  <div className="p-6 bg-gray-50 border border-gray-200 text-center text-gray-500 font-medium">
                    Vos scores sont équilibrés sur l'ensemble des dimensions de maturité.
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="border-t border-gray-200 pt-16"
        >
          <div className="space-y-10">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-black flex items-center justify-center">
                <ChevronRight className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-3xl font-light tracking-tight text-gray-900">
                Prochaines étapes recommandées
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                onClick={() => navigate('/recommendations', { state: { scores: displayScores, maturity } })}
                className="bg-white border border-gray-200 p-8 hover:border-black hover:shadow-lg transition-all group text-left flex flex-col h-full relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-0 bg-black group-hover:h-full transition-all duration-300" />
                <div className="space-y-6 flex-1">
                  <div className="p-3 bg-gray-50 inline-block text-gray-800 group-hover:bg-[#FFE600] group-hover:text-black transition-colors">
                    <Target className="w-6 h-6" />
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-lg font-bold text-gray-900">Plan d'action & Recommandations</h4>
                    <p className="text-sm text-gray-500 leading-relaxed font-medium">
                      Découvrez les actions priorisées et personnalisées pour améliorer votre maturité sur chaque axe.
                    </p>
                  </div>
                </div>
                <div className="pt-8 flex items-center text-xs font-bold tracking-widest text-gray-400 group-hover:text-black transition-colors uppercase mt-auto">
                  Consulter le plan <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </button>

              <button
                onClick={() => navigate('/simulation', { state: { scores: displayScores } })}
                className="bg-white border border-gray-200 p-8 hover:border-black hover:shadow-lg transition-all group text-left flex flex-col h-full relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-0 bg-black group-hover:h-full transition-all duration-300" />
                <div className="space-y-6 flex-1">
                  <div className="p-3 bg-gray-50 inline-block text-gray-800 group-hover:bg-[#FFE600] group-hover:text-black transition-colors">
                    <Settings2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-lg font-bold text-gray-900">Simulateur d'impact</h4>
                    <p className="text-sm text-gray-500 leading-relaxed font-medium">
                      Modélisez virtuellement les gains potentiels de maturité en ajustant vos investissements stratégiques.
                    </p>
                  </div>
                </div>
                <div className="pt-8 flex items-center text-xs font-bold tracking-widest text-gray-400 group-hover:text-black transition-colors uppercase mt-auto">
                  Lancer la simulation <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </button>

              <button
                onClick={() => navigate('/dashboard')}
                className="bg-white border border-gray-200 p-8 hover:border-black hover:shadow-lg transition-all group text-left flex flex-col h-full relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-0 bg-black group-hover:h-full transition-all duration-300" />
                <div className="space-y-6 flex-1">
                  <div className="p-3 bg-gray-50 inline-block text-gray-800 group-hover:bg-[#FFE600] group-hover:text-black transition-colors">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-lg font-bold text-gray-900">Dashboard Management</h4>
                    <p className="text-sm text-gray-500 leading-relaxed font-medium">
                      Accédez à la vue consolidée, suivez l'évolution historique et comparez-vous au benchmark du marché.
                    </p>
                  </div>
                </div>
                <div className="pt-8 flex items-center text-xs font-bold tracking-widest text-gray-400 group-hover:text-black transition-colors uppercase mt-auto">
                  Accéder au Dashboard <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
