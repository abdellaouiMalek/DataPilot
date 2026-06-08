import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import eyLogo from '../assets/EY_logo2.png';
import { motion } from 'motion/react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, DollarSign, Clock, Shield, RotateCcw, Play } from 'lucide-react';

interface Scores {
  gouvernance: number;
  qualite: number;
  architecture: number;
  usage: number;
  culture: number;
  strategie: number;
}

const DIMENSION_LABELS: Record<keyof Scores, string> = {
  gouvernance: 'Gouvernance',
  qualite: 'Qualité',
  architecture: 'Architecture',
  usage: 'Usage',
  culture: 'Culture',
  strategie: 'Stratégie',
};

const DIMENSION_SHORT_LABELS: Record<keyof Scores, string> = {
  gouvernance: 'Gouv.',
  qualite: 'Qualité',
  architecture: 'Arch.',
  usage: 'Usage',
  culture: 'Culture',
  strategie: 'Strat.',
};

export function SimulationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const initialScores: Scores = location.state?.scores || {
    gouvernance: 2.5,
    qualite: 2.8,
    architecture: 2.3,
    usage: 2.6,
    culture: 2.7,
    strategie: 2.4,
  };

  const [currentScores] = useState<Scores>(initialScores);
  const [targetScores, setTargetScores] = useState<Scores>({
    gouvernance: 4.0,
    qualite: 4.2,
    architecture: 3.8,
    usage: 4.0,
    culture: 3.9,
    strategie: 4.1,
  });

  const calculateImpact = () => {
    const currentAvg = Object.values(currentScores).reduce((a, b) => a + b, 0) / 6;
    const targetAvg = Object.values(targetScores).reduce((a, b) => a + b, 0) / 6;
    const improvement = ((targetAvg - currentAvg) / currentAvg) * 100;

    return {
      timeSaved: Math.round(improvement * 5),
      costReduction: Math.round(improvement * 8000),
      riskReduction: Math.round(improvement * 3),
      compliance: Math.min(100, Math.round(65 + improvement * 2)),
    };
  };

  const impact = calculateImpact();

  const comparisonData = (Object.keys(targetScores) as Array<keyof Scores>).map((key) => ({
    dimension: DIMENSION_SHORT_LABELS[key],
    actuel: currentScores[key],
    cible: targetScores[key],
  }));

  const currentAvg = Object.values(currentScores).reduce((a, b) => a + b, 0) / 6;
  const targetAvg = Object.values(targetScores).reduce((a, b) => a + b, 0) / 6;

  const timelineData = [
    { month: 'M0', score: currentAvg },
    { month: 'M3', score: (currentAvg + targetAvg) / 2 - 0.3 },
    { month: 'M6', score: (currentAvg + targetAvg) / 2 },
    { month: 'M9', score: (currentAvg + targetAvg) / 2 + 0.3 },
    { month: 'M12', score: targetAvg },
  ];

  const handleReset = () => {
    setTargetScores({
      gouvernance: 4.0,
      qualite: 4.2,
      architecture: 3.8,
      usage: 4.0,
      culture: 3.9,
      strategie: 4.1,
    });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-black/5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={eyLogo} alt="EY" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
              <div>
                <div className="text-xs sm:text-sm tracking-wide text-black/60 font-medium">MOTEUR DE SIMULATION</div>
                <div className="text-[10px] sm:text-xs text-black/40">Modélisation d'impact what-if</div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button
                onClick={handleReset}
                className="flex-1 sm:flex-initial justify-center px-3 sm:px-4 py-2 border border-black/10 text-xs sm:text-sm text-black hover:bg-black/5 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="flex-1 sm:flex-initial justify-center px-3 sm:px-4 py-2 bg-black text-white hover:bg-black/90 text-xs sm:text-sm transition-colors"
              >
                Retour
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-8 py-8 sm:py-16">
        {/* Title Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 sm:mb-16"
        >
          <div className="space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-6xl font-light leading-tight text-black">
              Simulez l'impact
              <br />
              <span className="relative inline-block font-normal">
                de vos actions
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.8, delay: 0.5 }}
                  className="absolute -bottom-1 sm:-bottom-2 left-0 h-2 sm:h-4 bg-[#FFE600] -z-10"
                />
              </span>
            </h1>
            <p className="text-sm sm:text-lg text-black/70 max-w-2xl leading-relaxed">
              Ajustez vos scores cibles pour chaque dimension et visualisez l'impact projeté
              sur vos métriques business : gains de temps, réduction des coûts et amélioration
              des KPI.
            </p>
          </div>
        </motion.div>

        {/* Configuration & KPIs Block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8 sm:mb-16"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
            {/* Left Column: Sliders */}
            <div className="lg:col-span-7 border border-black/5 bg-white p-5 sm:p-10">
              <div className="space-y-6 sm:space-y-8">
                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-light">Définir vos objectifs</h2>
                  <p className="text-xs sm:text-sm text-black/60">
                    Ajustez les scores cibles pour chaque dimension (1-5)
                  </p>
                </div>

                <div className="space-y-6 sm:space-y-8">
                  {(Object.keys(targetScores) as Array<keyof Scores>).map((dimension) => {
                    return (
                      <div key={dimension} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs sm:text-sm tracking-wide text-black/80 font-medium">
                            {DIMENSION_LABELS[dimension].toUpperCase()}
                          </label>
                          <div className="flex items-center gap-3 sm:gap-4">
                            <span className="text-[10px] sm:text-xs text-black/40">
                              Actuel: {currentScores[dimension].toFixed(1)}
                            </span>
                            <span className="text-lg sm:text-xl font-medium">
                              {targetScores[dimension].toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <div className="relative h-6 flex items-center">
                          <div className="w-full h-1.5 bg-black/5 relative rounded-full">
                            <div
                              className="absolute top-0 bottom-0 w-1 bg-black/30"
                              style={{
                                left: `${(currentScores[dimension] / 5) * 100}%`,
                              }}
                            />
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            step="0.1"
                            value={targetScores[dimension]}
                            onChange={(e) =>
                              setTargetScores({
                                ...targetScores,
                                [dimension]: parseFloat(e.target.value),
                              })
                            }
                            className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-[#FFE600] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-[#FFE600] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-black [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-none"
                          />
                        </div>
                        <div className="flex justify-between text-[9px] sm:text-xs text-black/40 px-0.5">
                          <span>Init.</span>
                          <span>Repro.</span>
                          <span>Défini</span>
                          <span>Géré</span>
                          <span>Optim.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Impact KPIs */}
            <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-6">
              <div className="border border-black/5 bg-[#fafafa] p-5 sm:p-8 space-y-6 flex-1">
                <div className="flex items-center gap-2 text-xs sm:text-sm tracking-wide text-black/60 font-medium">
                  <Play className="w-4 h-4 text-[#FFE600]" />
                  IMPACT PROJETÉ
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6">
                  <motion.div key={impact.timeSaved} initial={{ scale: 0.98 }} animate={{ scale: 1 }} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-black/60">
                      <Clock className="w-4 h-4 text-[#FFE600] flex-shrink-0" />
                      Gain de temps
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <div className="text-3xl sm:text-4xl font-light">{impact.timeSaved}h</div>
                      <div className="text-xs text-black/60">/ mois économisés</div>
                    </div>
                  </motion.div>

                  <motion.div key={impact.costReduction} initial={{ scale: 0.98 }} animate={{ scale: 1 }} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-black/60">
                      <DollarSign className="w-4 h-4 text-[#FFE600] flex-shrink-0" />
                      Réduction des coûts
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <div className="text-3xl sm:text-4xl font-light">{impact.costReduction.toLocaleString()}DT</div>
                      <div className="text-xs text-black/60">/ an</div>
                    </div>
                  </motion.div>

                  <motion.div key={impact.riskReduction} initial={{ scale: 0.98 }} animate={{ scale: 1 }} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-black/60">
                      <Shield className="w-4 h-4 text-[#FFE600] flex-shrink-0" />
                      Réduction des risques
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <div className="text-3xl sm:text-4xl font-light">-{impact.riskReduction}%</div>
                      <div className="text-xs text-black/60">incidents</div>
                    </div>
                  </motion.div>

                  <motion.div key={impact.compliance} initial={{ scale: 0.98 }} animate={{ scale: 1 }} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-black/60">
                      <TrendingUp className="w-4 h-4 text-[#FFE600] flex-shrink-0" />
                      Score de conformité
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <div className="text-3xl sm:text-4xl font-light">{impact.compliance}%</div>
                      <div className="text-xs text-[#2e8b57] font-medium">+{impact.compliance - 65}%</div>
                    </div>
                  </motion.div>
                </div>
              </div>

              <div className="border border-[#FFE600] bg-[#FFE600]/10 p-5 sm:p-6">
                <div className="text-[10px] tracking-wider text-black/60 mb-1 font-semibold">HORIZON</div>
                <div className="text-xl sm:text-2xl font-light">12 mois</div>
                <div className="text-xs text-black/60 mt-1">
                  Durée estimée pour atteindre les objectifs
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Charts Sections */}
        <div className="space-y-6 sm:space-y-8">
          {/* Bar Chart Container */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="border border-black/5 bg-white p-4 sm:p-10"
          >
            <div className="mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-light mb-1">Comparaison actuel vs. cible</h2>
              <p className="text-xs sm:text-sm text-black/60">Visualisation de l'écart à combler par dimension</p>
            </div>
            <div className="w-full h-[300px] sm:h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                  <XAxis dataKey="dimension" tick={{ fill: '#1a1a1a', fontSize: 11 }} axisLine={{ stroke: '#00000020' }} />
                  <YAxis domain={[0, 5]} tick={{ fill: '#6b6b6b', fontSize: 11 }} axisLine={{ stroke: '#00000020' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #00000010', borderRadius: '2px', fontSize: 12 }} />
                  <Legend wrapperStyle={{ paddingTop: '15px', fontSize: 12 }} />
                  <Bar dataKey="actuel" fill="#8b8b8b" radius={[2, 2, 0, 0]} name="Actuel" />
                  <Bar dataKey="cible" fill="#FFE600" radius={[2, 2, 0, 0]} name="Cible" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Line Chart Container */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="border border-black/5 bg-white p-4 sm:p-10"
          >
            <div className="mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-light mb-1">Trajectoire de progression</h2>
              <p className="text-xs sm:text-sm text-black/60">Projection de l'évolution du score moyen sur 12 mois</p>
            </div>
            <div className="w-full h-[250px] sm:h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                  <XAxis dataKey="month" tick={{ fill: '#1a1a1a', fontSize: 11 }} axisLine={{ stroke: '#00000020' }} />
                  <YAxis domain={[0, 5]} tick={{ fill: '#6b6b6b', fontSize: 11 }} axisLine={{ stroke: '#00000020' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #00000010', borderRadius: '2px', fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#FFE600"
                    strokeWidth={3}
                    dot={{ fill: '#FFE600', r: 5 }}
                    activeDot={{ r: 7 }}
                    name="Maturité moyenne"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </div>

        {/* Bottom Call-to-Action Block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-8 sm:mt-16 border border-black/5 bg-[#fafafa] p-6 sm:p-10"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-xl sm:text-2xl font-light">Prêt à passer à l'action ?</h3>
              <p className="text-xs sm:text-sm text-black/70">Consultez le plan d'action détaillé pour atteindre ces objectifs.</p>
            </div>
            <button
              onClick={() => navigate('/recommendations', {
                state: { scores: currentScores, targetScores: targetScores, isSimulation: true }
              })}
              className="w-full sm:w-auto text-center px-6 py-3.5 bg-[#FFE600] hover:bg-[#f5dc00] text-black font-medium text-xs sm:text-sm transition-colors"
            >
              Voir les recommandations
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}