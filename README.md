# 🌽 Blockchain-based Food Supply Chain Transparency

Welcome to a decentralized solution for ensuring ethical sourcing in the food industry! This project empowers consumers to scan QR codes on food packaging using a mobile app, revealing the complete, immutable supply chain history—from farm to table—stored on the Stacks blockchain. By leveraging Clarity smart contracts, it promotes transparency, combats issues like child labor, environmental harm, and counterfeit products, and builds trust in ethical sourcing.

## ✨ Features

🔍 Scan QR codes to view full supply chain journey  
🌿 Verify ethical certifications (e.g., fair trade, organic, sustainable)  
📜 Immutable records of each step: farming, processing, distribution, retail  
👥 Role-based access for participants (farmers, processors, distributors, retailers)  
✅ Real-time verification of product authenticity and origin  
🚫 Detect and prevent tampering or fraudulent claims  
💰 Incentive system for ethical practices via tokens  
📊 Analytics for supply chain efficiency and compliance  

## 🛠 How It Works

**For Supply Chain Participants (e.g., Farmers, Processors)**  
- Register your entity and role on the blockchain.  
- Create a new product batch with details like origin, harvest date, and initial certifications.  
- Log each supply chain step (e.g., processing, shipping) to update the batch's history.  
- Transfer ownership to the next participant, ensuring traceability.  
- Apply or verify ethical certifications at relevant stages.  
- Generate a unique QR code linked to the batch for packaging.  

**For Consumers**  
- Use the decentralized app (dApp) on your phone to scan the QR code.  
- Instantly view the batch's full history, including timestamps, locations, and certifications.  
- Verify authenticity and report any suspicions, triggering on-chain audits.  

**For Auditors/Regulators**  
- Access public views to inspect chains without altering data.  
- Use dispute tools to flag inconsistencies.  

This system solves real-world problems like opaque supply chains leading to unethical practices (e.g., exploited labor in cocoa farming) by making data transparent and tamper-proof. It involves 8 Clarity smart contracts for modularity and security.

## 📂 Smart Contracts Overview

This project uses 8 interconnected Clarity smart contracts deployed on the Stacks blockchain. Each handles a specific aspect of the supply chain:

1. **UserRegistry.clar**: Manages registration of participants with roles (farmer, processor, distributor, retailer). Stores user details and verifies identities.  
2. **BatchCreator.clar**: Allows authorized users to create new product batches, including initial metadata like product type, origin, and timestamp.  
3. **ChainLogger.clar**: Logs each supply chain event (e.g., harvesting, processing, shipping) as immutable entries linked to a batch.  
4. **OwnershipTransfer.clar**: Handles secure transfer of batch ownership between participants, ensuring only authorized roles can update.  
5. **CertificationManager.clar**: Issues and verifies ethical certifications (e.g., fair trade badges) from approved certifiers, stored on-chain.  
6. **QRLinker.clar**: Generates and associates unique QR codes with batches, mapping them to on-chain data for easy scanning.  
7. **HistoryViewer.clar**: Provides read-only functions for querying full batch histories, certifications, and verifications publicly.  
8. **DisputeResolver.clar**: Enables flagging of disputes or anomalies, with on-chain voting or arbitration for resolution, and logs outcomes immutably.  

These contracts interact seamlessly: for example, `ChainLogger` calls `OwnershipTransfer` during handoffs, and `HistoryViewer` pulls data from multiple sources for consumer queries.

## 🚀 Getting Started

1. Set up a Stacks wallet and Clarity development environment.  
2. Deploy the contracts in order (starting with UserRegistry).  
3. Build a simple dApp frontend (e.g., with React) for scanning and viewing.  
4. Test end-to-end: Register users, create a batch, log steps, generate QR, and scan to verify.  

Join the movement for ethical food sourcing—fork this repo and contribute! 🚀