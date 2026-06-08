import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import eyLogo from '../assets/ey-logo.png';
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

export function SimulationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialScores: Record<string, number> = location.state?.scores || {
    gouvernance: 2.5,
    qualite: 2.8,
    architecture: 2.3,
    usage: 2.6,
    culture: 2.7,
    strategie: 2.4,
  };

  const [currentScores] = useState<Record<string, number>>(initialScores);
  const [targetScores, setTargetScores] = useState<Record<string, number>>({
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

  const comparisonData = [
    { dimension: 'Gouvernance', actuel: currentScores.gouvernance, cible: targetScores.gouvernance },
    { dimension: 'Qualité', actuel: currentScores.qualite, cible: targetScores.qualite },
    { dimension: 'Architecture', actuel: currentScores.architecture, cible: targetScores.architecture },
    { dimension: 'Usage', actuel: currentScores.usage, cible: targetScores.usage },
    { dimension: 'Culture', actuel: currentScores.culture, cible: targetScores.culture },
    { dimension: 'Stratégie', actuel: currentScores.strategie, cible: targetScores.strategie },
  ];

  const timelineData = [
    { month: 'Maintenant', score: Object.values(currentScores).reduce((a, b) => a + b, 0) / 6 },
    { month: 'Mois 3', score: (Object.values(currentScores).reduce((a, b) => a + b, 0) / 6 + Object.values(targetScores).reduce((a, b) => a + b, 0) / 6) / 2 - 0.3 },
    { month: 'Mois 6', score: (Object.values(currentScores).reduce((a, b) => a + b, 0) / 6 + Object.values(targetScores).reduce((a, b) => a + b, 0) / 6) / 2 },
    { month: 'Mois 9', score: (Object.values(currentScores).reduce((a, b) => a + b, 0) / 6 + Object.values(targetScores).reduce((a, b) => a + b, 0) / 6) / 2 + 0.3 },
    { month: 'Mois 12', score: Object.values(targetScores).reduce((a, b) => a + b, 0) / 6 },
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
      <div className="border-b border-black/5">
        <div className="max-w-[1600px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={eyLogo} alt="EY" className="w-12 h-12 object-contain" />
              <div>
                <div className="text-sm tracking-wide text-black/60">MOTEUR DE SIMULATION</div>
                <div className="text-xs text-black/40">Modélisation d'impact what-if</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-black/10 text-black hover:bg-black/5 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Réinitialiser
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-black text-white hover:bg-black/90 transition-colors"
              >
                Retour au dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <div className="space-y-6">
            <h1 className="text-6xl leading-tight text-black">
              Simulez l'impact
              <br />
              <span className="relative inline-block">
                de vos actions
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.8, delay: 0.5 }}
                  className="absolute -bottom-2 left-0 h-4 bg-[#FFE600] -z-10"
                />
              </span>
            </h1>
            <p className="text-lg text-black/70 max-w-2xl">
              Ajustez vos scores cibles pour chaque dimension et visualisez l'impact projeté
              sur vos métriques business : gains de temps, réduction des coûts et amélioration
              des KPI.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-16"
        >
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-7 border border-black/5 bg-white p-10">
              <div className="space-y-8">
                <div className="space-y-2">
                  <h2 className="text-2xl">Définir vos objectifs</h2>
                  <p className="text-sm text-black/60">
                    Ajustez les scores cibles pour chaque dimension (1-5)
                  </p>
                </div>

                <div className="space-y-8">
                  {Object.keys(targetScores).map((dimension) => {
                    const labels: Record<string, string> = {
                      gouvernance: 'Gouvernance',
                      qualite: 'Qualité',
                      architecture: 'Architecture',
                      usage: 'Usage',
                      culture: 'Culture',
                      strategie: 'Stratégie',
                    };

                    return (
                      <div key={dimension} className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm tracking-wide text-black/80">
                            {labels[dimension].toUpperCase()}
                          </label>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-black/40">
                              Actuel: {currentScores[dimension as keyof typeof currentScores].toFixed(1)}
                            </span>
                            <span className="text-xl">
                              {targetScores[dimension as keyof typeof targetScores].toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <div className="relative">
                          <div className="h-2 bg-black/5 relative">
                            <div
                              className="absolute top-0 bottom-0 w-1 bg-black/30"
                              style={{
                                left: `${(currentScores[dimension as keyof typeof currentScores] / 5) * 100}%`,
                              }}
                            />
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            step="0.1"
                            value={targetScores[dimension as keyof typeof targetScores]}
                            onChange={(e) =>
                              setTargetScores({
                                ...targetScores,
                                [dimension]: parseFloat(e.target.value),
                              })
                            }
                            className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:bg-[#FFE600] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:bg-[#FFE600] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-black [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-none"
                          />
                        </div>
                        <div className="flex justify-between text-xs text-black/40">
                          <span>Initial</span>
                          <span>Reproductible</span>
                          <span>Défini</span>
                          <span>Géré</span>
                          <span>Optimisé</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="col-span-5 space-y-6">
              <div className="border border-black/5 bg-[#fafafa] p-8 space-y-6">
                <div className="flex items-center gap-2 text-sm tracking-wide text-black/60">
                  <Play className="w-4 h-4 text-[#FFE600]" />
                  IMPACT PROJETÉ
                </div>

                <div className="space-y-6">
                  <motion.div key={impact.timeSaved} initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-black/60">
                      <Clock className="w-4 h-4 text-[#FFE600]" />
                      Gain de temps
                    </div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-4xl">{impact.timeSaved}h</div>
                      <div className="text-sm text-black/60">/ mois économisés</div>
                    </div>
                  </motion.div>

                  <motion.div key={impact.costReduction} initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-black/60">
                      <DollarSign className="w-4 h-4 text-[#FFE600]" />
                      Réduction des coûts
                    </div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-4xl">{impact.costReduction.toLocaleString()}DT</div>
                      <div className="text-sm text-black/60">/ an</div>
                    </div>
                  </motion.div>

                  <motion.div key={impact.riskReduction} initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-black/60">
                      <Shield className="w-4 h-4 text-[#FFE600]" />
                      Réduction des risques
                    </div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-4xl">-{impact.riskReduction}%</div>
                      <div className="text-sm text-black/60">incidents</div>
                    </div>
                  </motion.div>

                  <motion.div key={impact.compliance} initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-black/60">
                      <TrendingUp className="w-4 h-4 text-[#FFE600]" />
                      Score de conformité
                    </div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-4xl">{impact.compliance}%</div>
                      <div className="text-sm text-[#2e8b57]">+{impact.compliance - 65}%</div>
                    </div>
                  </motion.div>
                </div>
              </div>

              <div className="border border-[#FFE600] bg-[#FFE600]/10 p-6">
                <div className="text-xs tracking-wider text-black/60 mb-2">HORIZON</div>
                <div className="text-2xl">12 mois</div>
                <div className="text-sm text-black/60 mt-1">
                  Durée estimée pour atteindre les objectifs
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mb-16"
        >
          <div className="border border-black/5 bg-white p-10">
            <div className="mb-8">
              <h2 className="text-2xl mb-2">Comparaison actuel vs. cible</h2>
              <p className="text-sm text-black/60">Visualisation de l'écart à combler par dimension</p>
            </div>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
                <XAxis dataKey="dimension" tick={{ fill: '#1a1a1a', fontSize: 12 }} axisLine={{ stroke: '#00000020' }} />
                <YAxis domain={[0, 5]} tick={{ fill: '#6b6b6b', fontSize: 12 }} axisLine={{ stroke: '#00000020' }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #00000010', borderRadius: '2px' }} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="actuel" fill="#8b8b8b" radius={[2, 2, 0, 0]} name="Score actuel" />
                <Bar dataKey="cible" fill="#FFE600" radius={[2, 2, 0, 0]} name="Score cible" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="border border-black/5 bg-white p-10"
        >
          <div className="mb-8">
            <h2 className="text-2xl mb-2">Trajectoire de progression</h2>
            <p className="text-sm text-black/60">Projection de l'évolution du score moyen sur 12 mois</p>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" />
              <XAxis dataKey="month" tick={{ fill: '#1a1a1a', fontSize: 12 }} axisLine={{ stroke: '#00000020' }} />
              <YAxis domain={[0, 5]} tick={{ fill: '#6b6b6b', fontSize: 12 }} axisLine={{ stroke: '#00000020' }} />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #00000010', borderRadius: '2px' }} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#FFE600"
                strokeWidth={3}
                dot={{ fill: '#FFE600', r: 6 }}
                activeDot={{ r: 8 }}
                name="Score moyen de maturité"
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-16 border border-black/5 bg-[#fafafa] p-10"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h3 className="text-2xl">Prêt à passer à l'action ?</h3>
              <p className="text-black/70">Consultez le plan d'action détaillé pour atteindre ces objectifs.</p>
            </div>
            <button
              onClick={() => navigate('/recommendations', {
                state: { scores: currentScores, targetScores: targetScores, isSimulation: true }
              })}
              className="px-8 py-4 bg-[#FFE600] hover:bg-[#f5dc00] text-black transition-colors"
            >
              Voir les recommandations
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
