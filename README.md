# OpsMind AI 🚀

OpsMind AI is a modern, full-stack SaaS platform designed to automate and manage Standard Operating Procedures (SOPs) using the power of Artificial Intelligence. It allows users to upload documents, interact with an AI Copilot to extract insights, and manage their subscription plans seamlessly.

## 🌟 Key Features

- **🤖 AI-Powered Copilot:** Integrate with Groq's blazing-fast Llama 3 model to instantly chat with and analyze your uploaded SOP documents.
- **📄 Document Management:** Securely upload and parse PDF documents for intelligent data extraction.
- **🔐 Secure Authentication:** Full user registration and login system with JWT-based session management and encrypted passwords.
- **💳 Integrated Billing:** End-to-end Razorpay payment gateway integration for seamless plan upgrades (Free, Pro, Enterprise).
- **✨ Modern UI/UX:** A stunning, fully responsive interface featuring custom glassmorphism effects and fluid animations.

## 🛠️ Technology Stack

**Frontend:**
- **React.js** (Bootstrapped with Vite)
- **Vanilla CSS3** (Custom design system, CSS Grid/Flexbox)
- **Framer Motion** (For fluid, interactive UI animations)

**Backend:**
- **Node.js & Express.js**
- **Multer & PDF-Parse** (For handling file uploads and extraction)
- **JSON Web Tokens (JWT) & Bcrypt** (For secure authentication)

**Database & AI:**
- **MongoDB Atlas** (Cloud NoSQL Database)
- **Groq API** (Llama 3.1 LLM integration)
- **Razorpay API** (Payment processing)

## 🚀 Getting Started

### Prerequisites
Make sure you have Node.js and npm installed on your machine. You will also need a MongoDB Atlas account, a Groq API key, and Razorpay test credentials.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/opsmind-ai.git
   cd opsmind-ai
   ```

2. **Install Backend Dependencies:**
   ```bash
   npm install
   ```

3. **Install Frontend Dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

### Configuration

Create a `.env` file in the root directory and add the following variables:

```env
# Server
PORT=5000

# Authentication
JWT_SECRET=your_super_secret_jwt_key_here

# Database
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/
MONGO_DB_NAME=sop_agent

# AI Provider (Groq)
GROQ_API_KEY=your_groq_api_key_here

# Payment Gateway (Razorpay)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

### Running the Application

To run both the backend server and the frontend Vite development server concurrently, run the following command from the root directory:

```bash
npm run dev
```

- The frontend will be available at: `http://localhost:5173`
- The backend API will be running on: `http://localhost:5000`

## 📁 Project Structure

```text
opsmind-ai/
├── frontend/                # React Vite application
│   ├── src/
│   │   ├── App.jsx          # Main application and routing
│   │   ├── Home.jsx         # Landing page and contact form
│   │   ├── Billing.jsx      # Subscription and invoice management
│   │   ├── Pricing.jsx      # Pricing tiers and upgrade path
│   │   ├── Payment.jsx      # Razorpay checkout integration
│   │   └── styles.css       # Custom global stylesheet
├── server.js                # Express backend entry point
├── package.json             # Root dependencies and concurrently scripts
└── .env                     # Environment variables (not tracked by git)
```

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📝 License
This project is licensed under the MIT License.
