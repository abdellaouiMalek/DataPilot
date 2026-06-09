import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { BarChart3, ChevronRight, ShieldCheck } from 'lucide-react';
import Select from "react-select";
import type { StylesConfig } from "react-select";
import EyLogo from '../assets/EY_logo2.png';

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
  'Wifak Bank'
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
    minHeight: '44px',
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
    border: '1px solid #e5e7eb',
    zIndex: 9999
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
    <div className="min-h-screen bg-white flex flex-col font-sans lg:h-screen lg:overflow-hidden text-slate-900">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="h-16 border-b border-gray-200 px-6 md:px-8 flex items-center justify-between flex-shrink-0 bg-white z-10"
      >
        <div className="flex items-center gap-4">
          <img 
            src={EyLogo} 
            alt="EY Logo" 
            className="h-7 w-auto object-contain select-none pointer-events-none" 
            />
          <div className="flex flex-col border-l border-gray-300 pl-4">
            <span className="text-xs font-bold tracking-[0.2em] text-gray-900 leading-none">
              DATA MATURITY
            </span>
            <span className="text-[10px] text-gray-500 tracking-widest mt-1">
              ASSESSMENT PLATFORM
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            System Status: Active
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-black transition-colors outline-none cursor-pointer"
          >
            <span className="bg-gray-100 p-1.5 rounded-sm">
              <BarChart3 className="w-4 h-4 text-black" />
            </span>
            DASHBOARD
          </button>
        </div>
      </motion.header>

      {/* Main Container - Flex Row on Large Screens, Stacking Column on Mobile */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        
        {/* Left Column - Hero */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="lg:w-[55%] bg-[#1a1a1a] text-white px-6 md:px-12 xl:px-16 py-12 flex flex-col justify-center relative overflow-hidden flex-shrink-0"
        >
          {/* Subtle responsive ambient glowing circle */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#FFE600]/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>

          <div className="relative z-10 space-y-8 max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 text-[10px] font-bold tracking-[0.2em] text-[#FFE600]"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>SECTEUR BANCAIRE TUNISIEN</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-4xl md:text-5xl lg:text-6xl font-light leading-tight tracking-tight"
            >
              Évaluez votre
              <br />
              maturité <span className="font-bold text-[#FFE600]">Data</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-gray-400 text-base md:text-lg leading-relaxed font-light max-w-md"
            >
              Analysez votre organisation selon six dimensions stratégiques. Obtenez des indicateurs de performance et des recommandations personnalisées.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="grid grid-cols-2 gap-8 md:gap-12 pt-10 border-t border-white/10 max-w-md"
            >
              <div className="space-y-1">
                <div className="text-4xl font-bold text-[#FFE600]">06</div>
                <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                  Dimensions Clés
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-4xl font-bold text-white">~15</div>
                <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                  Minutes Estimées
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Right Column - Profile Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex-1 lg:w-[45%] bg-[#F8F9FA] px-6 md:px-12 xl:px-16 py-12 overflow-y-auto flex flex-col justify-center items-center"
        >
          <div className="w-full max-w-[420px]">
  
            {/* Carte rigoureuse à haut contraste */}
            <div className="relative bg-white text-black border-2 border-white shadow-[0_25px_60px_-15px_rgba(255,255,255,0.1)]">
              
              {/* Ligne jaune EY supérieure */}
              <div className="absolute top-0 left-0 w-full h-[6px] bg-[#FFE600]" />

              {/* Wrapper du formulaire avec rembourrage étendu */}
              <div className="p-8 md:p-10">
                
                {/* En-tête / Titre */}
                <div className="space-y-2 mb-8 text-center sm:text-left">
                  <span className="text-[10px] font-extrabold tracking-[0.25em] text-[#FFE600] bg-black px-2.5 py-1 uppercase inline-block font-mono">
                    ÉVALUATION PROFESSIONNELLE EY
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-light text-black tracking-tight pt-2 font-display">
                    Commencer <span className="font-extrabold block">l'évaluation</span>
                  </h2>
                  <p className="text-xs text-neutral-500 font-light leading-relaxed">
                    Veuillez renseigner votre profil professionnel pour accéder aux modules d'audit.
                  </p>
                </div>

                {/* Formulaire contenant les sélections */}
                <div className="space-y-5">
                  
                  {/* 1. ÉTABLISSEMENT BANCAIRE */}
                  <div className="space-y-2">
                    <label className="text-black text-[10px] font-bold uppercase tracking-widest block font-mono">
                      Établissement Bancaire
                    </label>
                    <Select
                      options={bankOptions}
                      value={bankOptions.find(o => o.value === selectedBank) || null}
                      onChange={(option) => setSelectedBank(option?.value || '')}
                      placeholder="Sélectionnez"
                      styles={selectStyles}
                      isSearchable
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      components={{ IndicatorSeparator: () => null }}
                    />
                  </div>

                  {/* 2. DÉPARTEMENT */}
                  <div className="space-y-2">
                    <label className="text-black text-[10px] font-bold uppercase tracking-widest block font-mono">
                      Département
                    </label>
                    <Select
                      options={deptOptions}
                      value={deptOptions.find(o => o.value === selectedDepartment) || null}
                      onChange={(option) => setSelectedDepartment(option?.value || '')}
                      placeholder="Sélectionnez"
                      styles={selectStyles}
                      isSearchable
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      components={{ IndicatorSeparator: () => null }}
                    />
                  </div>

                  {/* 3. RÔLE / TITRE */}
                  <div className="space-y-2">
                    <label className="text-black text-[10px] font-bold uppercase tracking-widest block font-mono">
                      Rôle / Titre
                    </label>
                    <Select
                      options={roleOptions}
                      value={roleOptions.find(o => o.value === selectedRole) || null}
                      onChange={(option) => setSelectedRole(option?.value || '')}
                      placeholder="Sélectionnez"
                      styles={selectStyles}
                      isSearchable
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      components={{ IndicatorSeparator: () => null }}
                    />
                  </div>

                  {/* BOUTON D'ACTION PRINCIPAL */}
                  <button
                    onClick={handleStart}
                    disabled={!canProceed}
                    className={`w-full h-12 tracking-widest text-xs uppercase font-bold flex items-center justify-center gap-2.5 transition-all mt-8 border-2 cursor-pointer ${
                      canProceed
                        ? 'bg-black text-white border-black hover:bg-[#FFE600] hover:text-black active:scale-[0.99]'
                        : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
                    }`}
                  >
                    <span>COMMENCER L'ÉVALUATION</span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0" />
                  </button>

                </div>

                {/* Support / Lien secondaire inférieur */}
                <div className="mt-8 pt-6 border-t border-neutral-100 flex justify-center w-full">
                  <button
                    onClick={() => navigate('/results')}
                    className="text-[10px] font-bold text-neutral-400 hover:text-black border-b border-transparent hover:border-black py-1 transition-all uppercase tracking-widest font-mono outline-none cursor-pointer"
                  >
                    CONSULTER LES RÉSULTATS PRÉCÉDENTS
                  </button>
                </div>

              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
