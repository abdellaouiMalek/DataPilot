import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { BarChart3, Building2, Users, ChevronRight, TrendingUp, ShieldCheck } from 'lucide-react';
import Select from 'react-select';
import type { StylesConfig } from 'react-select';
import eyLogo from '../assets/ey-logo.png';

const banks = [
  'Banque de Tunisie (BT)',
  'Société Tunisienne de Banque (STB)',
  'Banque Nationale Agricole (BNA)',
  "Banque de l'Habitat (BH)",
  'Amen Bank',
  'Attijari Bank',
  'BIAT',
  'BTE (Banque de Tunisie et des Emirats)',
  'UIB (Union Internationale de Banques)',
  'ATB (Arab Tunisian Bank)',
  'Banque Zitouna',
  'Banque Tuniso-Koweitienne (BTK)',
  "UBCI (Union Bancaire pour le Commerce et l'Industrie)",
  'Banque Tunisienne de Solidarité (BTS)',
  'Wifak Bank',
  'Autre'
];
const departments = [
  "Systèmes d'Information",
  'Gestion des Risques',
  'Conformité & Audit',
  'Opérations Bancaires',
  'Finance & Comptabilité',
  'Crédit',
  'Trésorerie',
  'Ressources Humaines'
];
const roles = [
  'Responsable de Département',
  'Directeur',
  'Directeur Général / Adjoint',
  'Analyste',
  'Chef de Projet',
  'Consultant',
  'Cadre Supérieur'
];

const bankOptions = banks.map(b => ({ value: b, label: b }));
const deptOptions = departments.map(d => ({ value: d, label: d }));
const roleOptions = roles.map(r => ({ value: r, label: r }));

const selectStyles: StylesConfig<any, false> = {
  control: (base, state) => ({
    ...base,
    borderRadius: 0,
    minHeight: '48px',
    boxShadow: 'none',
    borderColor: state.isFocused ? '#000' : '#e5e7eb',
    '&:hover': {
      borderColor: state.isFocused ? '#000' : '#d1d5db'
    },
    backgroundColor: '#f9fafb',
    paddingLeft: '0.25rem',
    cursor: 'pointer'
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? '#FFE600'
      : state.isFocused
        ? '#f3f4f6'
        : 'white',
    color: state.isSelected ? 'black' : '#374151',
    fontWeight: state.isSelected ? 600 : 400,
    '&:active': {
      backgroundColor: '#FFE600',
    },
    cursor: 'pointer',
    padding: '12px 16px'
  }),
  placeholder: (base) => ({
    ...base,
    color: '#9ca3af',
    fontWeight: 400
  }),
  singleValue: (base) => ({
    ...base,
    color: '#111827',
    fontWeight: 500
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 0,
    marginTop: '4px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    border: '1px solid #e5e7eb'
  }),
  menuList: (base) => ({
    ...base,
    padding: 0
  })
};

export function LandingPage() {
  const navigate = useNavigate();
  const [selectedBank, setSelectedBank] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedRole, setSelectedRole] = useState('');

  const handleStart = () => {
    if (selectedBank && selectedDepartment && selectedRole) {
      navigate('/questionnaire', {
        state: { bank: selectedBank, department: selectedDepartment, role: selectedRole }
      });
    }
  };

  const canProceed = selectedBank && selectedDepartment && selectedRole;

  return (
    <div className="h-screen overflow-y-auto bg-white flex flex-col font-sans [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="border-b border-gray-200 px-8 py-5 bg-white z-10 relative"
      >
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-black flex items-center justify-center shadow-sm">
              <img src={eyLogo} alt="EY" className="w-9 h-9 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-widest text-gray-900">DATA MATURITY</span>
              <span className="text-xs text-gray-500 tracking-wider">ASSESSMENT PLATFORM</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="group flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-black transition-colors"
          >
            Management Dashboard
            <div className="p-2 bg-gray-50 group-hover:bg-[#FFE600] transition-colors rounded-sm">
              <BarChart3 className="w-4 h-4 text-black" />
            </div>
          </button>
        </div>
      </motion.header>

      <div className="flex-1 flex flex-col lg:flex-row relative">
        {/* Left Column - Hero */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="lg:w-[55%] bg-[#1a1a1a] text-white p-12 lg:p-24 flex flex-col justify-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative z-10 space-y-10 max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="inline-flex items-center gap-3 px-4 py-2 bg-white/10 border border-white/20 backdrop-blur-sm"
            >
              <ShieldCheck className="w-4 h-4 text-[#FFE600]" />
              <span className="text-xs font-semibold tracking-widest text-white/90">SECTEUR BANCAIRE TUNISIEN</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-5xl lg:text-7xl font-light leading-[1.1] text-white tracking-tight"
            >
              Évaluez votre
              <br />
              maturité
              <br />
              <span className="font-bold text-[#FFE600] mt-2 inline-block">
                Data
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="text-lg lg:text-xl text-gray-400 max-w-xl leading-relaxed font-light"
            >
              Une plateforme d'évaluation stratégique qui analyse votre organisation
              selon six dimensions clés. Obtenez des recommandations actionnables et mesurez votre progression.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="grid grid-cols-2 gap-8 pt-8 border-t border-white/10"
            >
              <div className="space-y-2">
                <div className="text-5xl font-bold text-[#FFE600]">6</div>
                <div className="text-sm font-medium tracking-wide text-gray-400">DIMENSIONS CLÉS</div>
              </div>
              <div className="space-y-2">
                <div className="text-5xl font-bold text-white">~20</div>
                <div className="text-sm font-medium tracking-wide text-gray-400">MINUTES REQUISES</div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Right Column - Form */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="lg:w-[45%] bg-gray-50 p-12 lg:p-24 flex flex-col justify-center"
        >
          <div className="max-w-md w-full mx-auto space-y-10">
            <div className="space-y-3">
              <h3 className="text-3xl font-bold text-gray-900 tracking-tight">
                Commencer l'évaluation
              </h3>
              <p className="text-base text-gray-500">Définissez votre profil pour personnaliser votre expérience d'évaluation.</p>
            </div>

            <div className="space-y-6 bg-white p-8 border border-gray-200 shadow-sm">
              <div className="space-y-3">
                <label className="text-xs font-bold tracking-widest text-gray-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  ÉTABLISSEMENT BANCAIRE
                </label>
                <Select
                  options={bankOptions}
                  value={bankOptions.find(o => o.value === selectedBank) || null}
                  onChange={(option) => setSelectedBank(option?.value || '')}
                  placeholder="Sélectionnez votre établissement"
                  styles={selectStyles}
                  isSearchable
                  components={{ IndicatorSeparator: () => null }}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold tracking-widest text-gray-700 flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  DÉPARTEMENT
                </label>
                <Select
                  options={deptOptions}
                  value={deptOptions.find(o => o.value === selectedDepartment) || null}
                  onChange={(option) => setSelectedDepartment(option?.value || '')}
                  placeholder="Sélectionnez votre département"
                  styles={selectStyles}
                  isSearchable
                  components={{ IndicatorSeparator: () => null }}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold tracking-widest text-gray-700 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  RÔLE
                </label>
                <Select
                  options={roleOptions}
                  value={roleOptions.find(o => o.value === selectedRole) || null}
                  onChange={(option) => setSelectedRole(option?.value || '')}
                  placeholder="Sélectionnez votre rôle"
                  styles={selectStyles}
                  isSearchable
                  components={{ IndicatorSeparator: () => null }}
                />
              </div>
            </div>

            <motion.button
              onClick={handleStart}
              disabled={!canProceed}
              whileHover={canProceed ? { scale: 1.02 } : {}}
              whileTap={canProceed ? { scale: 0.98 } : {}}
              className={`w-full px-6 py-4 flex items-center justify-center gap-3 font-bold tracking-wide transition-all shadow-sm ${
                canProceed
                  ? 'bg-[#FFE600] hover:bg-[#e6cf00] text-black border border-[#e6cf00]'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
              }`}
            >
              COMMENCER L'ÉVALUATION
              <ChevronRight className="w-5 h-5" />
            </motion.button>

            <div className="pt-8 border-t border-gray-200 text-center">
              <button
                onClick={() => navigate('/results')}
                className="text-sm font-semibold text-gray-500 hover:text-black transition-colors inline-flex items-center gap-1"
              >
                Accéder aux évaluations précédentes <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
