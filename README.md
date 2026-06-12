# 🚀 DataPilot

### 📊 Data Maturity Assessment & Digital Transformation Accelerator for Tunisian Banks

<div align="center">

**Transforming Data into Strategic Value**

*Assess • Benchmark • Simulate • Accelerate*

</div>

---

## 🌟 About The Project

DataPilot is an intelligent consulting platform developed at **EY Tunisia** to help banking institutions evaluate their data maturity, identify transformation priorities, and accelerate their digital transformation journey.

Unlike traditional maturity assessments that only provide a score, DataPilot goes one step further by combining:

✅ Data Maturity Assessment

✅ AI-Powered Recommendations

✅ Business Impact Simulation

✅ Strategic Roadmap Generation

The objective is simple:

> **Help banks understand where they are, define where they want to go, and quantify the value of getting there.**

---

# 🎯 Business Challenges Addressed

Banks today face multiple challenges:

🔹 Increasing regulatory pressure

🔹 Fragmented data ecosystems

🔹 Data quality issues

🔹 Lack of governance frameworks

🔹 Slow decision-making processes

🔹 Difficulty measuring transformation progress

🔹 Misalignment between data initiatives and business objectives

DataPilot was designed to address these challenges through a structured and measurable approach.

---

# ✨ Key Features

## 📋 Intelligent Data Maturity Assessment

Evaluate the organization's maturity across multiple strategic dimensions.

### Covered Dimensions

🏛️ Data Governance

🎯 Data Strategy

🏗️ Data Architecture

💾 Data Management

📈 Analytics & Business Intelligence

🔐 Data Security & Compliance

🧩 Technology & Infrastructure

👥 Data Culture & Organization

📊 Data Quality

---

## 🧠 AI Recommendation Engine

Leverages Artificial Intelligence to:

✨ Detect maturity gaps

✨ Identify improvement opportunities

✨ Generate actionable recommendations

✨ Prioritize initiatives

✨ Support strategic decision-making

---

## 📊 Advanced Scoring System

Generate:

📈 Global maturity score

📈 Dimension maturity scores

📈 Radar charts

📈 Heatmaps

📈 Performance indicators

📈 Benchmark visualizations

---

## 🚀 Digital Transformation Simulator

One of DataPilot's most innovative capabilities.

Simulate expected business gains before launching transformation initiatives.

### ⏱️ Time-to-Market Simulation

Estimate:

* Product delivery acceleration
* Faster reporting cycles
* Reduced operational delays

### ⚠️ Risk Reduction Simulation

Estimate:

* Compliance improvements
* Data quality enhancements
* Operational risk reduction

### 💰 Business Value Simulation

Estimate:

* Productivity gains
* Cost optimization
* Resource efficiency improvements

---

## 🗺️ Intelligent Roadmap Generator

Automatically generate transformation roadmaps including:

🎯 Quick Wins

🎯 Mid-Term Initiatives

🎯 Strategic Projects

🎯 Long-Term Vision

---

## 📊 Executive Dashboards

Provide stakeholders with:

📌 Real-Time KPIs

📌 Maturity Monitoring

📌 Progress Tracking

📌 Strategic Insights

📌 Executive Reporting

---

## 🏦 Banking-Oriented Framework

The framework is specifically adapted to the Tunisian banking sector through:

✔ Banking-specific assessment criteria

✔ Regulatory alignment

✔ Governance requirements integration

✔ Risk management considerations

✔ Strategic business alignment

---

## 🔐 Security & Access Management

* Secure Authentication
* Role-Based Access Control
* Session Management
* Protected APIs
* User Administration

---

# 🏗️ Solution Architecture

```text
┌─────────────────────────┐
│      React Frontend     │
│     (User Interface)    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│      FastAPI Backend    │
│    Business Services    │
└────────────┬────────────┘
             │
 ┌───────────┼───────────┐
 ▼           ▼           ▼

📊 Assessment Engine
🧠 AI Recommendation Engine
🚀 Business Gain Simulator

             │
             ▼

┌─────────────────────────┐
│      PostgreSQL DB      │
└─────────────────────────┘
```

---

# 🛠️ Technology Stack

## 🎨 Frontend

* React
* TypeScript
* Tailwind CSS
* Shadcn UI
* Recharts

## ⚙️ Backend

* FastAPI
* Python

## 🗄️ Database

* PostgreSQL

## 🤖 Artificial Intelligence

* Pandas
* NumPy
* Scikit-Learn
* Machine Learning Models

## 🔧 Development Tools

* Git
* GitHub
* Jira
* Figma

---

# 📦 Core Modules

| Module                      | Purpose                        |
| --------------------------- | ------------------------------ |
| 📋 Assessment Engine        | Data maturity evaluation       |
| 📊 Scoring Engine           | Maturity calculation           |
| 🤖 AI Recommendation Engine | Intelligent recommendations    |
| 🚀 Transformation Simulator | Business gain simulation       |
| 📈 Dashboard Module         | Visualization & analytics      |
| 👤 User Management          | Authentication & authorization |
| 🗺️ Roadmap Generator       | Strategic action plans         |

---

# 🏁 Getting Started

Follow these steps to run DataPilot locally for the first time.

## ✅ Prerequisites

| Requirement    | Version / Notes                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| **Node.js**    | 22.x (Vite 8)                                                                   |
| **Python**     | 3.11 or 3.12 recommended (some DB driver wheels lag on newer versions)          |
| **PostgreSQL** | Running locally; a database named **`datapilot`** must exist                    |
| **Keycloak**   | Required for auth. A realm with a **public** client (PKCE / `S256`) and tokens whose **audience is `react-app`** (the backend enforces this) |

## 1. Clone & configure environment

```bash
git clone <repo-url>
cd DataPilot

# Backend env: copy the template and fill in your values
cp backend/.env.example backend/.env

# Frontend env: copy the template and fill in your values
cp frontend/.env.example frontend/.env
```

## 2. Backend (FastAPI)

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt

# Create the database tables (drops & recreates)
python -m app.db.init_db

# Run the API (http://localhost:8000)
uvicorn app.main:app --reload
```

## 3. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

> **Windows / PowerShell note:** if `npm run dev` exits immediately after printing `> vite`, use `npm.cmd run dev` (or run it from Command Prompt). The PowerShell `npm` wrapper can send the dev server an early stdin EOF that shuts it down.

## 4. Open the app

Visit **http://localhost:5173**. You'll be redirected to Keycloak to log in (the app uses `login-required`), so Keycloak must be running and configured before the UI will render.

---

# 🎯 Expected Business Benefits

Through DataPilot, banks can:

✅ Improve Data Governance

✅ Strengthen Regulatory Compliance

✅ Increase Data Quality

✅ Accelerate Digital Transformation

✅ Reduce Operational Risks

✅ Optimize Decision-Making

✅ Align Data Initiatives with Business Objectives

✅ Maximize Value Creation

---

# 📸 Platform Preview

### Dashboard

*(Screenshot coming soon)*

### Assessment Module

*(Screenshot coming soon)*

### AI Recommendations

*(Screenshot coming soon)*

### Business Impact Simulator

*(Screenshot coming soon)*

---

# 🚧 Project Status

### Current Progress

✅ Benchmark Analysis Completed

✅ Existing State Assessment Completed

✅ Banking Survey Completed

✅ Framework Design Completed

✅ Functional Design Completed

🔄 Platform Development In Progress

🔄 AI Integration In Progress

🔄 Dashboard Development In Progress

⏳ Final Deployment

---

# 👩‍💻 Author

### Malek Abdellaoui

🎓 Final-Year Data Science Engineering Student

🏢 EY Tunisia

📍 End-of-Studies Project (PFE)

### Project Title

**Development of a Data Maturity Management Tool and Digital Transformation Accelerator for Tunisian Banks**

---

# 🌍 Vision

> "Data maturity is not an objective by itself. It is the foundation that enables organizations to transform data into strategic value, operational excellence, and sustainable growth."

---

