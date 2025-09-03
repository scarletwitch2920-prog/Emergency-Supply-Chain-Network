# 🚨 Emergency Supply Chain Network

Welcome to a decentralized blockchain solution for real-time supply chain mapping during emergencies! This project uses the Stacks blockchain and Clarity smart contracts to enable international relief organizations, governments, and suppliers to coordinate aid without silos, ensuring transparent, efficient distribution of critical supplies like food, medicine, and shelter in disaster scenarios.

## ✨ Features

🌍 Real-time global visibility of supply inventories and shipments  
📡 Instant request and fulfillment matching for emergency needs  
🔒 Immutable tracking to prevent fraud and duplication  
🤝 Multi-party collaboration with role-based access  
📊 Analytics for post-event audits and optimization  
⚡ Automated alerts and status updates via blockchain events  
🌐 Interoperable with off-chain systems for IoT integration (e.g., GPS trackers)  
💰 Incentive mechanisms for timely deliveries  

## 🛠 How It Works

This network leverages 8 Clarity smart contracts to create a robust, decentralized system. Creators (e.g., relief organizations) can register supplies, log shipments, and respond to requests. Verifiers (e.g., auditors or recipients) can track and confirm deliveries in real-time.

**For Relief Coordinators (e.g., NGOs or Governments)**

- Register your organization and declare an emergency event.
- Submit supply requests with details like location, quantity, and urgency.
- View matched shipments and track their progress on the blockchain.

**For Suppliers and Logistics Providers**

- Register available inventory with hashes for verification.
- Respond to open requests by initiating shipments.
- Update shipment statuses (e.g., in-transit, delivered) immutably.

**For Verifiers and Auditors**

- Query the blockchain for full supply chain history.
- Verify deliveries against registered hashes and timestamps.
- Access analytics for efficiency reports.

The system ensures no single entity controls the data, reducing silos and enabling faster international coordination.

## 📂 Smart Contracts Overview

The project involves 8 Clarity smart contracts, each handling a specific aspect of the supply chain:

1. **OrganizationRegistry.clar**: Manages registration of participants (NGOs, suppliers, governments) with roles (e.g., requester, supplier, verifier). Includes functions for verification and role updates.

2. **EmergencyDeclaration.clar**: Allows authorized users to declare emergencies, defining scope (location, type, duration) and activating heightened network features like priority matching.

3. **SupplyItemRegistry.clar**: Defines and registers supply types (e.g., water, tents) with metadata. Prevents duplicates via unique hashes.

4. **InventoryManagement.clar**: Tracks stock levels for registered organizations. Functions for adding/removing inventory, with event emissions for real-time updates.

5. **RequestSystem.clar**: Enables creation of supply requests tied to emergencies. Includes urgency scoring and public visibility for matching.

6. **ShipmentTracking.clar**: Logs shipments from supplier to recipient, with status updates (e.g., shipped, en-route, delivered). Integrates GPS hashes for proof.

7. **MatchingEngine.clar**: Automates matching of requests to available inventories based on location, quantity, and urgency. Uses algorithmic logic for fair allocation.

8. **VerificationAudit.clar**: Handles delivery confirmations, dispute resolution, and audit trails. Stores proofs (e.g., signatures, hashes) for immutable verification.

These contracts interact seamlessly—e.g., a shipment in `ShipmentTracking` references an inventory from `InventoryManagement` and fulfills a request from `RequestSystem`.

## 🚀 Getting Started

Deploy the contracts on the Stacks testnet using Clarinet. Interact via the Stacks Wallet or custom frontend. Generate hashes for supplies using SHA-256 for integrity.

Boom! Your emergency supply chain is now transparent and coordinated on the blockchain.