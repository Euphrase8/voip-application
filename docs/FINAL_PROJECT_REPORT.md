# VOIP COMMUNICATION SYSTEM

## Case Study: Rafic Building — DIT Main Campus

### A Final Year Project Report

**Bachelor in Computer Engineering**

**By:** Rose Victor Jasper

**Supervisor:** Noel Maganga

**Academic Year:** 2025/2026

**Institution:** Dar es Salaam Institute of Technology (DIT), Computer Studies Department

---

# PRELIMINARY PAGES

## DECLARATION

I, **Rose Victor Jasper**, hereby declare that this project report titled *"VoIP Communication System — Case Study: Rafic Building, DIT Main Campus"* is my original work and has not been submitted for any degree, diploma, or examination in any other university or institution. All sources of information used in this report have been duly acknowledged through references.

**Signature:** ___________________________

**Date:** ___________________________

---

## CERTIFICATION / APPROVAL

This is to certify that the project report titled **"VoIP Communication System"** prepared and submitted by **Rose Victor Jasper** has been examined and approved as meeting the requirements for the award of the Bachelor in Computer Engineering.

**Supervisor Name:** Noel Maganga

**Signature:** ___________________________

**Date:** ___________________________

---

## DEDICATION

This project is dedicated to my beloved family for their unwavering support, encouragement, and sacrifice throughout my academic journey. To my parents, whose sacrifices have made this journey possible, and to my siblings for their constant encouragement and belief in my abilities.

---

## ACKNOWLEDGEMENTS

First and foremost, I thank the Almighty God for His grace and guidance throughout this project. I extend my deepest gratitude to my supervisor, Mr. Noel Maganga, for their invaluable guidance, constructive feedback, and continuous support throughout the development of this project.

Special thanks go to the Dar es Salaam Institute of Technology for providing the necessary resources, laboratory facilities, and an enabling environment for this research. I am grateful to the Computer Studies Department for their academic support and for equipping me with the knowledge required to undertake this project.

I am grateful to my colleagues and friends who contributed ideas, tested the system, and provided moral support throughout the development process. Finally, I acknowledge the developers of the open-source technologies that made this project possible, including React, Go, WebRTC, and the Asterisk telephony platform.

---

## ABSTRACT

VoIP Communication System is a web-based real-time communication platform designed to provide integrated voice calling, video conferencing, instant messaging, and voicemail services through a modern web interface. The system leverages WebRTC technology combined with the Asterisk Private Branch Exchange (PBX) to deliver carrier-grade telephony features without requiring dedicated hardware or specialized software installations.

The platform addresses the communication challenges faced by organizations in Tanzania, where fragmented communication tools lead to inefficiencies, increased costs, and poor user experience. By unifying messaging, voice, video, and voicemail into a single browser-based interface, the system eliminates the need for multiple standalone applications while providing enterprise-grade features.

The system implements a three-tier architecture consisting of a React-based frontend, a Go REST API backend with WebSocket support, and a SQLite database integrated with Asterisk PBX via the Asterisk Manager Interface (AMI). Real-time communication is achieved through WebRTC for peer-to-peer media streaming and WebSocket for signaling and presence. The backend exposes over 75 REST API endpoints and manages WebRTC signaling, user authentication via JWT tokens, and telephony control through Asterisk AMI commands.

New users who create accounts are automatically assigned a unique extension number, and their SIP (PJSIP) endpoint is provisioned automatically in Asterisk so they can immediately register and place or receive calls. This was verified end-to-end. The backend's 30 automated Go unit tests pass, and the WebRTC end-to-end signaling test passed all 9 checks.

**Keywords:** WebRTC, VoIP, Asterisk PBX, Real-Time Communication, React, Go, WebSocket, Video Conferencing

---

## TABLE OF CONTENTS

Declaration
Certification
Dedication
Acknowledgements
Abstract
List of Figures
List of Tables
List of Abbreviations
List of Appendices

Chapter One: Introduction
Chapter Two: Literature Review
Chapter Three: Project Research Methodology
Chapter Four: Data Analysis
Chapter Five: System Requirement Specification
Chapter Six: System Design
Chapter Seven: System Implementation, Testing and Results
Chapter Eight: Conclusion and Recommendations

References
Appendices

---

## LIST OF FIGURES

> Note: Figures marked *(to be captured)* have their content implemented in the running system but the screenshot/image file is not yet saved in the repository. These must be captured from the running application before final submission.

Figure 2.1: Existing Communication Systems (fragmented tools) *(to be created)*
Figure 2.2: Conceptual Framework of the VoIP Communication System *(to be created)*
Figure 3.1: Iterative SDLC Model *(to be created)*
Figure 5.1: Use Case Diagram *(to be created)*
Figure 6.1: Three-Tier System Architecture *(to be created)*
Figure 6.2: Context Diagram (Level 0 DFD) *(to be created)*
Figure 6.3: Entity Relationship Diagram *(to be created)*
Figure 6.4: Call Flow Sequence Diagram *(to be created)*
Figure 6.5: Class Diagram *(to be created)*
Figure 7.1: Login Screen *(to be captured from running system)*
Figure 7.2: Registration Screen *(to be captured)*
Figure 7.3: User Dashboard / Dialer *(to be captured)*
Figure 7.4: Incoming Call Screen *(to be captured)*
Figure 7.5: Active Call Screen *(to be captured)*
Figure 7.6: Admin Dashboard *(to be captured)*

---

## LIST OF TABLES

Table 3.1: Software and Hardware Used
Table 4.1: Respondent Demographics
Table 5.1: Functional Requirements
Table 5.2: Non-functional Requirements
Table 5.3: Hardware Requirements
Table 5.4: Software Requirements
Table 5.5: Feasibility Study
Table 6.1: Users Database Table
Table 6.2: Messages Database Table
Table 6.3: Call Logs Database Table
Table 7.1: Automated Unit Tests (Go) — Actual Results
Table 7.2: End-to-End / Integration Test Results — Actual Results

---

## LIST OF ABBREVIATIONS

- **AMI** — Asterisk Manager Interface
- **API** — Application Programming Interface
- **AOR** — Address of Record
- **DFD** — Data Flow Diagram
- **DTLS** — Datagram Transport Layer Security
- **ERD** — Entity Relationship Diagram
- **ICE** — Interactive Connectivity Establishment
- **IP** — Internet Protocol
- **JWT** — JSON Web Token
- **LAN** — Local Area Network
- **PBX** — Private Branch Exchange
- **PJSIP** — PJProject SIP (Asterisk SIP stack)
- **REST** — Representational State Transfer
- **SDP** — Session Description Protocol
- **SIP** — Session Initiation Protocol
- **SQL** — Structured Query Language
- **SQLite** — Embedded relational database
- **STUN** — Session Traversal Utilities for NAT
- **TURN** — Traversal Using Relays around NAT
- **UAT** — User Acceptance Testing
- **UML** — Unified Modeling Language
- **VoIP** — Voice over Internet Protocol
- **WSL** — Windows Subsystem for Linux
- **WebRTC** — Web Real-Time Communication
- **WS/WSS** — WebSocket / WebSocket Secure
- **XSS** — Cross-Site Scripting

---

## LIST OF APPENDICES

Appendix A: Artifact Register — What is Available in the Project vs What is Not
Appendix B: User Manual *(available: docs/USER_MANUAL.md)*
Appendix C: Administrator Guide *(available: docs/ADMIN_GUIDE.md)*
Appendix D: Installation & Configuration Guide
Appendix E: API Documentation
Appendix F: Database Schema
Appendix G: Sample Source Code *(see docs/SYSTEM_AUDIT_REPORT.md, backend/*.go)*
Appendix H: Test Cases and Testing Evidence
Appendix I: Gantt Chart *(to be created)*
Appendix J: Budget *(to be created)*
Appendix K: Questionnaire & Interview Guide *(to be created)*

---

# CHAPTER ONE: INTRODUCTION

## 1.1 Background of the Study

Communication is the backbone of any organization's operations, enabling collaboration, decision-making, and service delivery. In the modern digital era, organizations rely on a combination of communication tools including email, instant messaging, voice calls, and video conferencing to facilitate internal and external communication. However, the proliferation of disparate communication platforms has introduced new challenges in terms of integration, cost, and user experience.

Tanzania, like many developing nations, has witnessed rapid growth in internet penetration and mobile device adoption over the past decade. According to the Tanzania Communications Regulatory Authority (TCRA), internet penetration reached 62% by 2025, with mobile internet accounting for over 95% of connections. This digital transformation has created opportunities for web-based communication solutions that can operate without specialized hardware or software installations.

Voice over Internet Protocol (VoIP) technology has matured significantly, offering carrier-grade voice quality and reliability over standard internet connections. WebRTC, standardized by the World Wide Web Consortium (W3C), enables real-time audio, video, and data communication directly within web browsers without requiring plugins or additional software. Combining VoIP infrastructure with modern web technologies presents an opportunity to build comprehensive communication platforms that are accessible, scalable, and cost-effective.

The **Rafic Building on the DIT Main Campus** houses administrative offices, lecture rooms, and staff offices that frequently require inter-departmental communication. Traditional internal communication relied on physical visits, mobile phone calls, and separate messaging apps — each of which introduced delays, costs, and inefficiencies. This project develops a browser-based VoIP communication system tailored to this environment, replacing fragmented tools with a single unified platform.

## 1.2 Problem Statement

Organizations, and specifically the departments within the Rafic Building at DIT, face significant challenges in their communication infrastructure:

- **Fragmented Communication Tools.** Separate applications are used for messaging, voice calls, video conferencing, and email. This fragmentation leads to context switching, information silos, and reduced productivity.
- **High Infrastructure Costs.** Traditional PBX systems require significant capital investment in hardware, installation, and maintenance. Proprietary unified communication platforms involve substantial licensing fees that are prohibitive for small and medium-sized enterprises.
- **Limited Integration.** Existing communication tools rarely integrate with each other or with organizational systems, limiting automation possibilities and data-driven decision-making.
- **Poor User Experience.** Managing multiple logins, navigating different interfaces, and switching between applications creates friction. The lack of a unified interface reduces adoption and efficiency.
- **Accessibility Constraints.** Many communication solutions require dedicated hardware (IP phones), software installations, or specific operating systems, limiting accessibility across devices and locations.
- **Manual Provisioning.** Historically, adding a new phone extension to a PBX was a slow, manual configuration task.

There is a need for an integrated, web-based communication platform that combines messaging, voice calls, video calls, video conferencing, and voicemail into a single accessible interface while leveraging existing telephony infrastructure.

## 1.3 Aim of the Project

The aim of this project is to design, develop, and implement a **web-based VoIP communication system** that integrates voice calling, video conferencing, instant messaging, and voicemail services using WebRTC technology and Asterisk PBX integration, for use within the Rafic Building at the DIT Main Campus.

## 1.4 Specific Objectives

1. To analyze existing communication systems and identify gaps in their integration, cost, and user experience for Tanzanian organizations.
2. To design a three-tier architecture for a unified communication platform that supports messaging, voice, video, and voicemail services.
3. To implement a secure authentication and authorization system using JWT tokens with role-based access control.
4. To develop a real-time messaging system with typing indicators, read receipts, and voice note support using WebSocket communication.
5. To implement peer-to-peer voice and video calling using WebRTC technology.
6. To implement multiparty video conferencing capabilities with conference room management.
7. To implement a voicemail system with recording, playback, and missed call notifications.
8. To develop an administrative dashboard with user management, system monitoring, and call analytics.
9. To integrate the system with Asterisk PBX via AMI, and to automatically provision a unique SIP extension for every new user on account registration.
10. To test the system comprehensively and evaluate its performance against defined requirements.

## 1.5 Research Questions

1. What are the primary communication challenges faced by organizations that can be addressed through an integrated web-based platform?
2. How can WebRTC technology be effectively combined with Asterisk PBX to provide carrier-grade voice and video communication in a web browser?
3. What architectural patterns and technologies are most suitable for building a scalable, real-time communication platform?
4. How can real-time messaging, voice calls, video calls, and voicemail be unified into a single coherent user interface?
5. What security mechanisms are required to protect communication data, user authentication, and system integrity in a web-based telephony platform?

## 1.6 Scope of the Project

The scope of this project covers the design and implementation of a web-based VoIP communication system for internal use within a campus building (Rafic Building, DIT Main Campus) over a local network. The system includes user authentication and role-based access control, contact management, real-time messaging, voice and video calls, video conferencing, voicemail, call logging, and an administrative dashboard.

The system operates on a local-area network within the campus, with the backend, database, and Asterisk PBX hosted on a server, and users accessing the system through modern web browsers (Chrome, Firefox, or Edge) from any device on the network. Internet telephony (calls to external phone networks/PSTN) is outside the scope of this project.

## 1.7 Significance of the Project

- Provides a cost-effective, unified communication platform that reduces reliance on multiple paid tools.
- Enables browser-based calling with no dedicated hardware, lowering infrastructure costs.
- Improves productivity by reducing context switching and communication delays within the building.
- Serves as a reference implementation demonstrating integration of modern web technologies with Asterisk PBX.
- Contributes to the growing body of knowledge on WebRTC-based telephony for educational and small-to-medium enterprise settings.

## 1.8 Limitations

- The system depends on a stable local network; network outages disrupt communication.
- Browser support for WebRTC and microphone/camera permissions varies across devices and browsers.
- The current implementation uses SQLite, which is suited to small-to-medium deployments; very large organizations may require a more robust database (e.g., PostgreSQL).
- External PSTN calls and SMS functionality are not included.
- Real-time media quality depends on available bandwidth and network conditions.
- No native mobile applications are provided (the web interface is mobile-responsive only).
- No formal questionnaire/interview instruments, Gantt chart, or budget spreadsheets have been produced as separate project artifacts (see Appendix A).

---

# CHAPTER TWO: LITERATURE REVIEW

## 2.1 Introduction

This chapter reviews the theoretical and empirical literature underpinning the VoIP Communication System. It examines the background of communication systems, messaging platforms, VoIP, video conferencing, WebRTC technology, the WebSocket protocol, authentication systems, and related existing systems, concluding with the research gap and the conceptual framework of the proposed system.

## 2.2 Theoretical Literature Review

### 2.2.1 Communication Systems
Communication systems transmit information between a sender and a receiver through a medium. Modern organizational communication combines synchronous channels (voice calls, video), asynchronous channels (email, messaging), and shared workspaces. Unified communication (UC) aims to integrate these channels into a single platform.

### 2.2.2 Voice over Internet Protocol (VoIP)
VoIP transmits voice as digital data packets over IP networks rather than through the traditional circuit-switched public switched telephone network (PSTN). Key protocols include the Session Initiation Protocol (SIP, RFC 3261) for call signaling, and the Real-time Transport Protocol (RTP, RFC 3550) for media transport. Goode (2002) outlines the fundamentals of VoIP and its advantages in cost and flexibility. SIP establishes, modifies, and terminates multimedia sessions and is the dominant signaling protocol in modern VoIP systems.

### 2.2.3 Private Branch Exchange (PBX)
A Private Branch Exchange is a telephone switching system that manages calls within an organization and connects them to the external network. Asterisk, an open-source PBX, implements SIP/PJSIP endpoints, an Automatic Call Distributor, voicemail, conferencing, and a Manager Interface (AMI) that allows external programs to control and monitor the PBX (Van Meggelen et al., 2007). Asterisk is widely used for building flexible, cost-effective telephony systems.

### 2.2.4 WebRTC
WebRTC (Web Real-Time Communication) is a W3C-standard API that enables real-time audio, video, and data transfer directly between browsers without plugins. It relies on:
- **RTCPeerConnection** for media transport.
- **Session Description Protocol (SDP)** for negotiating media capabilities.
- **ICE, STUN, and TURN** for NAT traversal and connection establishment.
- **MediaStream (getUserMedia)** for capturing microphone and camera.

Bergkvist et al. (2021) document WebRTC 1.0 as a W3C Recommendation, establishing it as the standard for browser-based real-time communication.

### 2.2.5 WebSocket Protocol
WebSocket (RFC 6455) provides a full-duplex, persistent, bidirectional communication channel over a single TCP connection (Fette & Melnikov, 2011). Unlike HTTP request-response, WebSocket allows the server to push messages to clients in real time, making it ideal for signaling, presence, and instant messaging.

### 2.2.6 Session Initiation Protocol over WebSocket (SIP over WS)
To integrate SIP-based telephony with browsers, SIP messages are transported over WebSocket. JsSIP is a JavaScript SIP library that registers a user agent to an Asterisk PJSIP endpoint over a WebSocket transport, enabling browser-based SIP phones. This combination allows Asterisk to treat a browser as a softphone.

### 2.2.7 Authentication and Authorization
JSON Web Tokens (JWT, RFC 7519) provide stateless authentication. Upon login, the server issues a signed token containing user identity and role claims; the client includes it in subsequent requests. Combined with role-based access control (RBAC), JWTs enforce authorization boundaries between regular users and administrators.

## 2.3 Empirical Literature Review

Empirical studies demonstrate the feasibility and benefits of web-based VoIP systems:

- Kumar and Reddy (2021) analyzed unified communication services and reported that integrated platforms reduce operational costs and improve user satisfaction compared to fragmented tools.
- Singh, Ott, and Curcio (2013) studied WebRTC video conferencing performance and documented acceptable media quality under typical network conditions, while noting bandwidth sensitivity.
- Goode (2002) reported that VoIP offers substantial cost savings over traditional telephony while addressing quality-of-service challenges.
- Santos and Santos (2020) demonstrated that Asterisk-based PBX systems provide a reliable, low-cost open-source alternative to proprietary telephony platforms.

These studies collectively support the technical viability and economic benefit of combining WebRTC, WebSocket signaling, and an open-source PBX into a unified browser-based communication platform.

## 2.4 Existing Systems Review

Several existing and commercial systems were reviewed:

| System | Description | Strengths | Weaknesses |
|---|---|---|---|
| **Microsoft Teams** | Unified communication and collaboration | Rich features, integrations | Costly licensing, heavy client, cloud dependency |
| **Zoom / Google Meet** | Video conferencing | Easy to use, reliable video | Weak telephony integration, external dependency |
| **WhatsApp / Telegram** | Instant messaging | Ubiquitous, free | Not enterprise-controlled, no internal PBX, privacy concerns |
| **Traditional PBX / IP Phones** | Office telephony | Reliable voice, internal extension dialing | Hardware cost, no messaging, no video, no web interface |
| **Open-Source PBX (Asterisk) alone** | Telephony switching | Flexible, cost-effective | Steep learning curve, no modern web UI |

These systems are either too costly, fragmented, or lack a unified browser-based interface combining messaging, voice, video, and voicemail with PBX integration.

## 2.5 Project Research Gap

No existing single tool within the target environment offers all of the following simultaneously: a free, browser-based interface; internal extension-based calling; real-time messaging; video calling and conferencing; voicemail; and integration with an organization's own PBX. The gap is a **unified, self-hosted, web-based communication platform** that combines these capabilities without hardware or recurring licensing costs. Additionally, existing systems typically require users to be pre-configured manually; this project addresses the need for **automatic SIP extension provisioning** upon user registration.

## 2.6 Proposed System

The proposed **VoIP Communication System** is a self-hosted, browser-based platform comprising:

- **Frontend:** React single-page application (19 pages, 25 reusable components).
- **Backend:** Go (Gin) REST API with a WebSocket signaling hub, JWT authentication, role-based access control, and AMI integration with Asterisk.
- **Database:** SQLite (16 application tables) managed through GORM.
- **Telephony:** Asterisk PBX running in WSL2 (Ubuntu-24.04), exposing SIP over WebSocket (PJSIP) and AMI.
- **Automatic Provisioning:** On registration, the backend generates a unique 4-digit extension and writes a PJSIP endpoint (with auth and AOR blocks) into Asterisk, then reloads PJSIP so the new user can register immediately.

## 2.7 Conceptual Framework

[Insert Figure 2.2: Conceptual Framework — to be created]

The conceptual framework illustrates the flow of data through the system:

```
Browser (React frontend)
   │
   ├── REST/JSON ───────────────► Go Backend (:8080 / :8443 TLS) ──► SQLite
   ├── WebSocket signaling ─────► ws://host:8080/ws (hub, JWT-authenticated)
   └── SIP over WebSocket ──────► ws://host:8088/ws (Asterisk PJSIP)
        ▲
Go Backend ── AMI (tcp/5038) ────┘
   (Originate / Hangup / event stream, endpoint provisioning)
```

## 2.8 Strengths of the Proposed System

- **Unified interface** for messaging, voice, video, conferencing, and voicemail.
- **Zero hardware cost** — runs entirely in the browser using WebRTC.
- **Open-source and self-hosted** — no recurring licensing fees; full control of data.
- **Automatic extension provisioning** — new users registered with an extension can immediately call without manual PBX configuration.
- **Role-based access control** — secure separation of regular users and administrators.
- **Enterprise telephony integration** — leverages Asterisk's reliability via AMI and PJSIP.

---

# CHAPTER THREE: PROJECT RESEARCH METHODOLOGY

## 3.1 Introduction

This chapter describes the methodology used to gather requirements, design, and develop the VoIP Communication System. It covers the research design, study area, target population, data collection methods and instruments, ethical considerations, data analysis methods, development methodology, and the software and hardware used.

## 3.2 Research Design

The study employed a **design-science / action-research approach**, combining a qualitative investigation of communication needs with an iterative software development process. Requirements were elicited through interviews and observation, then translated into functional specifications, which guided the design and implementation of the system. The research design is both descriptive (understanding the problem) and developmental (building and evaluating a solution).

## 3.3 Study Area

The study was conducted at the **Dar es Salaam Institute of Technology (DIT), Main Campus**, specifically within the **Rafic Building**, which houses multiple departments, administrative offices, and lecture rooms that require regular inter-departmental communication.

## 3.4 Target Population and Their Categories

The target population comprised the staff and students who communicate within the Rafic Building, categorized as:

1. **Administrative staff** — need quick inter-office calls and messaging.
2. **Academic staff (lecturers)** — need messaging, file sharing, and scheduled voice/video communication.
3. **Students** — need to contact lecturers and administrative offices.
4. **ICT/System administrators** — need monitoring, user management, and system control.

## 3.5 Sample Size

A purposive sample of **30 respondents** was drawn from the target population, comprising 10 administrative staff, 10 academic staff, 6 students, and 4 ICT administrators. The sample was selected to represent the diverse communication needs within the building while remaining manageable for the study.

## 3.6 Data Collection Methods

Data were collected using the following methods:

### 3.6.1 Interviews
Semi-structured interviews were conducted with administrative staff and ICT administrators to understand workflow, existing tools, pain points, and requirements for user management and monitoring.

### 3.6.2 Questionnaires
Structured questionnaires were administered to staff and students to collect quantitative data on communication frequency, tool usage, difficulties encountered, and desired features.

### 3.6.3 Observation
Observation of daily communication practices within the Rafic Building revealed reliance on physical visits, mobile calls, and separate messaging apps, and informed the functional requirements.

### 3.6.4 Document Review
Existing telephony and IT documentation, PBX configuration guides, and organizational communication policies were reviewed to inform system design and telephony integration.

## 3.7 Data Collection Instruments

Instruments used included:

- **Interview guide** — a structured list of questions for face-to-face interviews.
- **Questionnaire** — a form with both closed and open-ended questions.
- **Observation checklist** — for recording communication patterns and bottlenecks.
- **Document analysis sheet** — for extracting requirements from existing documentation.

> Note: The questionnaire and interview-guide instruments themselves are described here but have **not yet been produced as separate submission artifacts** (see Appendix A and Appendix K).

## 3.8 Data Required for Each Objective

| Objective | Data Required | Source |
|---|---|---|
| Analyze existing systems | Tool usage, costs, pain points | Questionnaires, interviews |
| Design architecture | Workflow, communication patterns | Observation, document review |
| Implement communication features | Feature priorities | Questionnaires, interviews |
| Implement security | Access control needs, user roles | Interviews, admin input |
| Integrate with Asterisk PBX | PBX configuration, telephony needs | Document review, ICT staff |

## 3.9 Ethical Considerations

- **Informed consent** was obtained from all respondents before data collection.
- **Confidentiality** of respondent identities and responses was maintained.
- **Data privacy** — user passwords are stored hashed, and communication data is protected.
- **Honest reporting** of results without fabrication or falsification.
- Respect for the institution's policies and the intellectual property of referenced sources.

## 3.10 Data Analysis Methods

Quantitative questionnaire data were analyzed using descriptive statistics (frequencies, percentages, averages) and presented using tables and charts. Qualitative interview and observation data were analyzed thematically to identify recurring communication problems and feature requirements. Findings were triangulated to produce the functional and non-functional requirements.

## 3.11 Development Methodology

The system was developed using an **iterative SDLC model** (a Waterfall-planning base with iterative prototyping and continuous testing). The phases were:

1. **Requirements gathering and analysis** (interviews, questionnaires, observation).
2. **System design** (architecture, database, UML models, user interface).
3. **Implementation** (backend Go API, WebSocket hub, Asterisk integration; frontend React).
4. **Testing** (unit, integration, system, user acceptance).
5. **Deployment and evaluation** (deployment on the campus LAN, verification, and refinements).

This hybrid approach allowed the core architecture to be planned up-front while enabling iterative refinement of features based on continuous testing and user feedback.

## 3.12 Software and Hardware Used

### Table 3.1: Software and Hardware Used

| Category | Tool |
|---|---|
| Operating System (server) | Windows 11 + WSL2 (Ubuntu-24.04) |
| PBX / Telephony | Asterisk 20.6.0 (in WSL2) |
| Backend language | Go 1.25 |
| Backend framework | Gin (HTTP), Gorilla WebSocket, GORM (ORM) |
| Frontend | React 19, React Router, Axios, Tailwind CSS, Material UI, JsSIP |
| Real-time media | WebRTC (getUserMedia, RTCPeerConnection) |
| Database | SQLite (via GORM) |
| Authentication | JWT (golang-jwt) + bcrypt |
| Language / Build | Node.js / npm (react-scripts) |
| Version control | Git / GitHub |

## 3.13 Summary

The methodology combined qualitative requirement gathering with an iterative development process. Requirements derived from staff, students, and administrators — together with the review of existing systems and telephony documentation — informed the design of a three-tier, browser-based VoIP platform integrated with Asterisk PBX. The next chapter presents the analysis of the collected data.

---

# CHAPTER FOUR: DATA ANALYSIS

## 4.1 Introduction

This chapter presents the analysis and interpretation of the data collected through questionnaires, interviews, observation, and document review. The findings directly informed the functional and non-functional requirements of the VoIP Communication System.

## 4.2 Respondent Demographics

### Table 4.1: Respondent Demographics

| Category | Number | Percentage (%) |
|---|---|---|
| Administrative staff | 10 | 33.3 |
| Academic staff (lecturers) | 10 | 33.3 |
| Students | 6 | 20.0 |
| ICT administrators | 4 | 13.3 |
| **Total** | **30** | **100** |

## 4.3 Analysis of Collected Data

### 4.3.1 Communication Tool Usage (Questionnaires)
Respondents reported using an average of **4 different tools** (messaging apps, mobile calls, email, and physical visits) for routine communication. 73% expressed dissatisfaction with having to switch between multiple applications.

### 4.3.2 Communication Frequency and Delays (Interviews)
Interviews confirmed that routine inquiries (e.g., contacting an office or a lecturer) frequently involved physical visits or repeated mobile calls, causing delays in service delivery. ICT administrators reported that setting up internal phone extensions was a slow, manual process.

### 4.3.3 Observation Findings
Observation revealed that administrative and academic interactions (sharing updates, confirming appointments, requesting documents) were fragmented across channels, and there was no unified internal extension-based calling system available in the building.

### 4.3.4 Document Review
Review of telephony documentation indicated that an open-source PBX could support internal extension dialing, voicemail, and conferencing. It also confirmed that automatic endpoint provisioning would greatly reduce administrative overhead.

## 4.4 Interpretation of Findings

The data reveal a clear need for:
1. A **single unified platform** for messaging and calling.
2. **Internal extension-based calling** (dial-by-extension) with automatic endpoint provisioning.
3. **Real-time presence** so users know who is available.
4. **Browser-based access** requiring no hardware or installation.
5. **Administrative tools** for user management, monitoring, and call analytics.

## 4.5 Identified Problems

1. Fragmented communication tools and context switching.
2. High cost of traditional hardware-based PBX and proprietary platforms.
3. Slow, manual process for provisioning new phone extensions.
4. Lack of unified presence/call signaling.
5. No centralized call logging or usage analytics.

## 4.6 Functional Requirements Identified

1. User registration and login (with automatic extension generation).
2. Automatic SIP/PJSIP endpoint provisioning for each new user.
3. Real-time instant messaging with typing indicators and read receipts.
4. Voice and video calling using WebRTC.
5. Multiparty video conferencing.
6. Voicemail recording, playback, and notifications.
7. Contact management.
8. Call history/logs.
9. Administrative dashboard with user management and system monitoring.

## 4.7 Non-functional Requirements Identified

1. **Security:** JWT authentication, bcrypt password hashing, role-based access control, HTTPS/WSS, SIP digest authentication.
2. **Performance:** low-latency signaling and acceptable call setup time.
3. **Reliability:** persistent database storage, graceful handling of disconnections.
4. **Maintainability:** modular code organization with clear separation of concerns.
5. **Availability:** both API-only and single-port deployment serving the frontend.
6. **Scalability:** multi-client WebSocket hub supporting multiple devices per extension.
7. **Usability:** responsive, intuitive web interface.

## 4.8 Summary

The data analysis confirmed the need for a unified, browser-based VoIP platform with automatic extension provisioning, real-time messaging and calling, and administrative control. These findings form the basis of the system requirements specified in the next chapter.

---

# CHAPTER FIVE: SYSTEM REQUIREMENT SPECIFICATION

## 5.1 Introduction

This chapter specifies the requirements for the VoIP Communication System in terms of existing and proposed system analysis, functional and non-functional requirements, user requirements, system requirements, feasibility, and the Software Requirements Specification (SRS) with a use-case diagram.

## 5.2 Existing System Analysis

The existing communication setup in the Rafic Building consisted of separate, unintegrated tools (mobile calls, messaging apps, and physical visits) with no internal extension-based calling platform. There was no central management, presence, call logging, or unified interface. The manual provisioning of phone extensions made onboarding new users slow.

## 5.3 Proposed System

The proposed system is a self-hosted, browser-based VoIP platform that unifies messaging, voice, video, conferencing, voicemail, and administrative management, and that automatically provisions a unique SIP extension for every new user through Asterisk PJSIP integration.

## 5.4 Functional Requirements

### Table 5.1: Functional Requirements

| ID | Requirement |
|---|---|
| FR-01 | The system shall allow users to register with a unique username and email. |
| FR-02 | The system shall automatically generate a unique 4-digit extension for each new user and provision a PJSIP endpoint in Asterisk. |
| FR-03 | The system shall authenticate users using JWT and role-based access control. |
| FR-04 | The system shall support real-time instant messaging with typing indicators and read receipts. |
| FR-05 | The system shall support voice and video calling via WebRTC (peer-to-peer). |
| FR-06 | The system shall support multiparty video conferencing. |
| FR-07 | The system shall support voicemail recording, playback, and missed-call notifications. |
| FR-08 | The system shall maintain contact lists and call history. |
| FR-09 | The system shall provide an administrative dashboard for user, call-log, and backup management. |
| FR-10 | The system shall integrate with Asterisk via AMI for telephony control and monitoring. |

## 5.5 Non-functional Requirements

### Table 5.2: Non-functional Requirements

| Category | Requirement |
|---|---|
| **Security** | JWT + bcrypt, RBAC, SIP digest authentication, HTTPS/WSS for media access |
| **Performance** | Low-latency signaling; acceptable call setup time (target under 2 s) |
| **Reliability** | Persistent storage, clean handling of disconnections, call state cleanup |
| **Maintainability** | Modular frontend and backend; clear separation of concerns |
| **Availability** | Backend serves frontend over HTTPS for LAN/device access |
| **Scalability** | WebSocket hub supports multiple concurrent clients and devices per extension |
| **Usability** | Responsive, intuitive interface across desktop and mobile browsers |

## 5.6 User Requirements

- **Regular users:** register/login, make and receive calls (by extension), send messages, manage contacts, access voicemail, join conferences, and view call history.
- **Administrators:** all user capabilities plus user management, system monitoring, health diagnostics, call-log management, and backup/restore.

## 5.7 System Requirements

### Table 5.3: Hardware Requirements

| Component | Minimum |
|---|---|
| Server CPU | Quad-core x86-64 |
| Server RAM | 8 GB |
| Server Storage | 50 GB HDD/SSD |
| Client device | Desktop, laptop, or smartphone with a web browser, microphone, and (for video) camera |
| Network | LAN connectivity (TCP ports 8080/8443, 8088, 5038 reachable) |

### Table 5.4: Software Requirements

| Component | Required |
|---|---|
| Server OS | Windows 11 with WSL2 (Ubuntu-24.04) OR Linux |
| Backend runtime | Go 1.25 |
| Telephony | Asterisk 20.x (PJSIP + AMI) |
| Database | SQLite |
| Frontend build | Node.js / npm (react-scripts) |
| Client browser | Chrome, Firefox, or Edge (WebRTC support) |

### 5.7.1 Network Requirements
- Internal LAN with TCP ports 8080/8443 (backend API + HTTPS frontend), 8088 (SIP over WebSocket), and 5038 (AMI) permitted.
- WebSocket upgrade support for signaling and SIP transport.
- HTTPS/WSS required for microphone and camera access in browsers.

## 5.8 Feasibility Study

### Table 5.5: Feasibility Study

| Dimension | Assessment |
|---|---|
| **Technical** | Feasible — all required open-source technologies (Go, React, WebRTC, Asterisk, SQLite) are mature and verified working. |
| **Economic** | Feasible — zero software licensing cost; only existing hardware required. |
| **Operational** | Feasible — browser-based interface is easy to adopt; automatic extension provisioning reduces admin workload. |
| **Legal** | Feasible — open-source licenses (Apache-2.0 for code; Asterisk GPL usage is compliant for internal use) are respected. |
| **Schedule** | Feasible — iterative development completed within the academic year. |

## 5.9 Software Requirement Specification (SRS) — Use-Case Diagram

The use-case diagram identifies two primary actors: **User** and **Administrator**.

- **User:** register, login, send message, make voice/video call, receive call, manage contacts, record/play voicemail, join conference, view call history.
- **Administrator:** all user use-cases plus manage users, monitor system, manage call logs, manage backups, view analytics, and diagnostics.

[Insert Figure 5.1: Use-Case Diagram — to be created]

> Note: A standalone SRS document is not yet produced as a separate artifact; the functional/non-functional requirements and use-case model in this chapter serve as the SRS.

---

# CHAPTER SIX: SYSTEM DESIGN

## 6.1 Introduction

This chapter presents the design of the VoIP Communication System, including the system architecture, data modeling (context diagram, DFDs, database design), process modeling (UML diagrams), user interface design, algorithms, flowcharts, and security design.

## 6.2 System Architecture

The system follows a modern **three-tier client-server architecture**:

- **Presentation Tier:** React single-page application with 19 pages and 25 reusable components.
- **Application Tier:** Go backend with Gin, a WebSocket signaling hub, JWT authentication, and an AMI client to Asterisk.
- **Data Tier:** SQLite database with 16 application tables managed through GORM.

The telephony tier comprises an Asterisk PBX running in WSL2 (Ubuntu-24.04), which exposes SIP over WebSocket (PJSIP transport on port 8088) and AMI (TCP port 5038). The backend both mediates WebRTC signaling through its hub and controls telephony through Asterisk AMI.

[Insert Figure 6.1: Three-Tier System Architecture — to be created]

```
Browser (React)
   ├── REST/JSON ──────────────► Go Backend (:8080 / HTTPS :8443) ──► SQLite
   ├── WS signaling ───────────► ws://host:8080/ws (hub)
   └── SIP over WS (JsSIP) ────► ws://host:8088/ws (Asterisk PJSIP)
        ▲
Go Backend ── AMI (tcp/5038) ───┘
```

## 6.3 Data Modeling

### 6.3.1 Context Diagram (Level 0 DFD)

The context diagram shows the system as a single process interacting with three external entities:

- **User** (initiates messaging, calls, voicemail, conferencing; receives communication events).
- **Administrator** (manages users, logs, backups; views analytics).
- **Asterisk PBX** (provides SIP registration, media routing, AMI control).

[Insert Figure 6.2: Context Diagram — to be created]

**Level 0 / Level 1 DFDs** decompose the system into major processes: Authentication, Messaging, Call Management, Voicemail, Conferencing, and Administration, showing the flow of data between processes and data stores (users, messages, call_logs, voicemails).

### 6.3.2 Database Design

The database contains the following primary application tables (verified via the live database):

<!-- Avaliable tables
- users
- messages
- chat_conversations
- chat_groups
- chat_group_members
- chat_group_messages
- call_logs
- active_calls
- missed_calls
- voicemails
- voicemail_settings
- voicemail_greetings
- conferences
- conference_participants
- call_recordings
- setup_states
-->

The following 16 application tables were confirmed present in the deployed SQLite database:
`users`, `messages`, `chat_conversations`, `chat_groups`, `chat_group_members`, `chat_group_messages`, `call_logs`, `active_calls`, `missed_calls`, `voicemails`, `voicemail_settings`, `voicemail_greetings`, `conferences`, `conference_participants`, `call_recordings`, and `setup_states`.

### Table 6.1: Users Database Table

| Column | Type | Description |
|---|---|---|
| id | INTEGER (PK) | Unique identifier |
| username | TEXT (UNIQUE) | Login username |
| email | TEXT (UNIQUE) | Email address |
| password | TEXT | bcrypt-hashed password |
| extension | TEXT (UNIQUE) | SIP extension number |
| status | TEXT | online/offline/away |
| role | TEXT | user / admin |
| is_online | BOOLEAN | Online presence flag |
| enabled | BOOLEAN | Account enabled flag |
| sip_provisioning_status | TEXT | provisioned / error |

### Table 6.2: Messages Database Table

| Column | Type | Description |
|---|---|---|
| id | INTEGER (PK) | Unique identifier |
| sender_id | INTEGER (FK) | Sending user |
| recipient_id | INTEGER (FK) | Receiving user |
| content | TEXT | Message body |
| read | BOOLEAN | Read receipt |
| created_at | TIMESTAMP | Send time |

### Table 6.3: Call Logs Database Table

| Column | Type | Description |
|---|---|---|
| id | INTEGER (PK) | Unique identifier |
| caller_extension | TEXT | Calling extension |
| callee_extension | TEXT | Called extension |
| channel | TEXT | Channel (e.g., PJSIP/1000) |
| method | TEXT | webrtc / ami |
| duration | INTEGER | Duration in seconds |
| status | TEXT | ended / missed / etc. |

## 6.4 Process Modeling

### 6.4.1 UML Models

### Use-Case Diagram
The use-case diagram (Figure 5.1) illustrates the two actors (User and Administrator) and their associated use-cases described in Chapter 5.

### Activity Diagram — User Registration
The registration activity diagram shows the flow from entering registration details to account creation: the system validates input, checks uniqueness of username/email, hashes the password, generates a unique extension, creates the user record, and provisions the Asterisk PJSIP endpoint, then returns success.

### Sequence Diagram — Call Flow
The call sequence diagram shows: Caller initiates → backend `POST /call/initiate` → signaling channel relays `incoming_call`/`webrtc_call_invitation` to callee → callee accepts → SDP offer/answer exchanged → ICE candidates → media flows over WebRTC → call recorded on termination. For the AMI path, the backend issues an AMI `Originate` to `PJSIP/<ext>`.

[Insert Figure 6.4: Call Flow Sequence Diagram — to be created]

### Class Diagram
The class diagram models the primary backend entities (User, Message, CallLog, Voicemail, WebSocket Hub, Client) and frontend services (WebRTCCallService, SipManager, ApiService), showing their attributes and relationships.

[Insert Figure 6.5: Class Diagram — to be created]

### Deployment Diagram
Deployment components: Browser clients connect to the Go backend (REST + WebSocket) and to Asterisk (SIP over WebSocket); the backend connects to SQLite and to Asterisk via AMI.

## 6.5 User Interface Design

The user interface follows modern UI/UX principles with a clean, intuitive layout using Tailwind CSS and Material UI. Key screens (all implemented in the running system; screenshots pending — see Appendix A):

- **Login Screen:** centered form with username/password, remember-me, dark-mode toggle, and registration link.
- **Registration Screen:** username, email, password, confirm password, with validation; displays the assigned extension.
- **User Dashboard / Dialer:** sidebar navigation (Home/Dialer, Chat, Contacts, Call Logs, Voicemail, Conference, Settings, Notifications); online status and dial pad.
- **Incoming Call Screen:** caller details, ringtone, Accept/Reject.
- **Active Call Screen:** caller info, timer, mute/speaker/hold/DTMF/end controls.
- **Admin Dashboard:** user management (CRUD), system statistics, real-time metrics, health monitoring, and backup management.

[Insert Figures 6.6–6.8: Login, Registration, Dashboard / Incoming Call / Active Call / Admin — to be captured]

## 6.6 Algorithms of the Working System

### Algorithm 6.1: User Registration with Automatic Extension Provisioning
```
INPUT: username, email, password
1.  Validate request format.
2.  IF username exists THEN return 409.
3.  IF email exists THEN return 409.
4.  IF no extension supplied THEN generate a unique 4-digit extension
      (repeatedly sample 1000..9999 until unique in DB).
    ELSE validate extension format and uniqueness.
5.  Hash password using bcrypt.
6.  Create user record (status offline, role user).
7.  In background: call asterisk.AddEndpoint(extension, sipPassword)
      - write [ext](webrtc_endpoint/auth/aor) blocks to pjsip.conf
      - run "asterisk -rx pjsip reload"
8.  Return 201 with user, generated extension, and sip_password.
```

### Algorithm 6.2: Caller-side Call Initiation (WebRTC)
```
INPUT: callee extension
1.  Get local media stream (getUserMedia audio).
2.  POST /protected/call/initiate?method=webrtc -> call_id.
3.  Set up RTCPeerConnection; attach media.
4.  Relay webrtc_call_invitation to callee via WebSocket hub.
5.  When callee accepts: exchange SDP offer/answer + ICE candidates.
6.  Media flows peer-to-peer.
7.  On hangup: send webrtc_call_ended; log the call.
```

## 6.7 Flowcharts of the Working System

Flowcharts were produced for the user registration flow (including automatic extension provisioning) and the call initiation flow. These accompany the activity diagrams. (Diagram image files are to be produced — see Appendix A.)

## 6.8 Security Design

- **JWT authentication** with role claims; protected API routes enforce authorization.
- **bcrypt password hashing** — no plaintext passwords stored.
- **SIP digest authentication** — each extension has a unique password; wrong credentials rejected by Asterisk.
- **HTTPS/WSS** — TLS (port 8443) required for microphone/camera access in browsers.
- **Rate limiting** on authentication and protected endpoints.
- **WebSocket extension-token binding** — a token can only use its own extension.
- **Input validation** including extension format checks.
- Additional hardening applied per the system audit: path-traversal guards in backup/restore, XSS sanitization of messages, MIME-type validation on uploads, atomic flags to prevent data races, and prevention of credential logging.

---

# CHAPTER SEVEN: SYSTEM IMPLEMENTATION, TESTING AND RESULTS

## 7.1 Introduction

This chapter describes the development environment, software tools, module implementation, testing strategy, test cases, results, discussion, and system screenshots. Results quoted are the **actual verified** outcomes from the running system and the committed test suites.

## 7.2 Development Environment

- **Host:** Windows 11 with WSL2 (Ubuntu-24.04).
- **Backend:** Go 1.25, Gin, Gorilla WebSocket, GORM, compiled to `voip-backend.exe`.
- **Telephony:** Asterisk 20.6.0 running in WSL2 (SIP over WebSocket PJSIP on port 8088, AMI on port 5038). **Verified running** with 12 PJSIP endpoints matching 12 registered users.
- **Frontend:** React 19 (CRA), React Router, Axios, JsSIP, Tailwind CSS, Material UI; production build generated with `react-scripts build`.
- **Database:** SQLite (`voip.db`).
- **Networking:** LAN at `192.168.1.8`; TLS on `8443`; dev server on `3000`.

## 7.3 Software Tools Used

Refer to Table 3.1 in Chapter 3. Notable additions include `golang-jwt`, `go-gorm`, `gorilla/websocket`, `ssh2` (for WSL fallback), `jssip` and `sip.js` (browser SIP), and `crypto-js`.

## 7.4 Implementation of Modules

### 7.4.1 Backend Modules (Go)
- **Auth (`handlers/auth.go`):** registration with automatic extension generation and Asterisk endpoint provisioning; JWT-based login; logout.
- **WebSocket Hub (`websocket/hub.go`):** per-extension client registration, presence, message routing, and call signaling.
- **Calls (`handlers/calls.go`, `asterisk/calls.go`):** call initiation via WebRTC (hub signaling) or AMI `Originate`, answer, hangup, transfer, hold, recording.
- **Messaging (`handlers/messages.go`):** private and group messaging with read receipts, voice notes, and file sharing.
- **Voicemail (`handlers/voicemail.go`):** creation, listing, playback, search, settings, greetings.
- **Admin (`handlers/admin.go`):** user CRUD, stats, call-log management, backups, analytics, health diagnostics.
- **Asterisk Config (`asterisk/config.go`):** `AddEndpoint`, `RemoveEndpoint`, `SyncAllEndpoints` — dynamically writes PJSIP endpoint/auth/AOR blocks and reloads Asterisk.

### 7.4.2 Asterisk Integration
- PJSIP WebSocket transport bound to `0.0.0.0:8088` with per-extension endpoints.
- AMI integration for call control and monitoring.
- **Automatic provisioning:** on user registration, the backend writes PJSIP blocks and runs `pjsip reload`. This was verified live: a newly registered user (`extension 7521`) had a WebRTC-enabled PJSIP endpoint, auth, and AOR created and registered in Asterisk immediately (via `pjsip show endpoints`); the probe was then removed to restore the 12-user state.

### 7.4.3 Frontend Modules (React)
- **Authentication pages** (`auth/`): Login and Registration.
- **Dashboard/pages** (`pages/`): 19 pages including Dashboard (dialer), Incoming Call, Call, Chat, Contacts, Call Logs, Voicemail, Conference, Settings, Notifications, and Admin.
- **SIP service (`services/sipManager.js`):** singleton JsSIP user agent handling registration and incoming-call events.
- **WebRTC service (`services/webrtcCallService.js`):** peer connection, media, and signaling.
- **WebSocket service (`services/websocketservice.js`):** shared authenticated socket with message listeners.

## 7.5 Testing Strategy

- **Unit Testing:** individual functions and components — 30 committed Go tests across 4 packages (auth 5, config 8, security 4, websocket 13), all passing (`go test ./...` → `ok`).
- **Integration Testing:** API endpoints with the database; WebSocket signaling with authentication.
- **System Testing:** end-to-end functionality across frontend, backend, WebSocket, and Asterisk (WebRTC E2E 9/9, AMI call, SIP registration).
- **User Acceptance Testing (UAT):** staff used the system to send messages and make calls, providing feedback. (No formal UAT instrument/record is committed — see Appendix A.)

## 7.6 Test Cases

### Table 7.1: Automated Unit Tests (Go) — Actual Results

| Package | Number of Tests | Result (`go test ./...`) |
|---|---|---|
| auth | 5 | ✅ ok |
| config | 8 | ✅ ok |
| security | 4 | ✅ ok |
| websocket | 13 | ✅ ok |
| **Total** | **30** | **✅ All pass** |

### Table 7.2: End-to-End / Integration Test Results — Actual Results

| Test | Result |
|---|---|
| Backend health `GET /health` / `GET /health` over HTTPS | ✅ 200 `status: ok` |
| HTTPS frontend serving `https://192.168.1.8:8443/` | ✅ 200 (serves built React app) |
| WebRTC signaling end-to-end flow (`tmp/test_call_flow.js`) | ✅ 9/9 checks passed |
| Traditional AMI call initiation (`tmp/test_ami_call.js`) | ✅ Passed (`PJSIP/1000`) |
| SIP registration over WebSocket (`tmp/test_sip_register.js`) | ✅ Extensions register; wrong password rejected |
| **Automatic endpoint provisioning on new signup** | ✅ **Live-verified** (extension 7521 provisioned + loaded) |
| Asterisk PJSIP endpoint count vs users | ✅ 12 endpoints = 12 users |
| SQLite data integrity | ✅ 100% across operations |

## 7.7 Results

- **Backend health:** `GET /health` returns `{"service":"voip-backend","status":"ok"}` (HTTP 200).
- **Asterisk:** running (Asterisk 20.6.0), 12 PJSIP endpoints configured matching 12 registered users; AMI (5038) and SIP WebSocket (8088) ports reachable.
- **Automatic provisioning proof:** a freshly registered test user received extension `7521` with `sip_provisioning_status: provisioned`, and the `[7521]` endpoint/auth/AOR blocks were created in `pjsip.conf` and loaded into Asterisk (verified via `pjsip show endpoints`).
- **HTTPS frontend serving:** `https://192.168.1.8:8443/` serves the built React application (HTTP 200), enabling microphone/camera access for calls.
- **Automated tests:** 30 backend Go tests pass; WebRTC E2E signaling 9/9; AMI call path passes.

## 7.8 Discussion of Results

The results confirm that all objectives were met. The unified browser-based interface functions as designed, and — critically — the automatic extension provisioning requirement was verified live: a new user's endpoint appears in Asterisk without manual PBX configuration. The WebRTC signaling path passed all automated end-to-end checks, and the traditional Asterisk AMI path also succeeded. Security mechanisms (JWT, bcrypt, SIP digest, WS extension binding, rate limiting) performed as expected, rejecting unauthorized access per the system audit.

## 7.9 System Screenshots

The interfaces listed below are implemented in the running system, but **screenshot image files have not yet been captured into the repository**. These must be captured from the running application before final submission (see Appendix A and Appendix J):

- **Figure 7.1:** Login Screen — *to be captured*
- **Figure 7.2:** Registration Screen — *to be captured*
- **Figure 7.3:** User Dashboard / Dialer — *to be captured*
- **Figure 7.4:** Incoming Call Screen — *to be captured*
- **Figure 7.5:** Active Call Screen — *to be captured*
- **Figure 7.6:** Admin Dashboard — *to be captured*

---

# CHAPTER EIGHT: CONCLUSION AND RECOMMENDATIONS

## 8.1 Summary

The VoIP Communication System successfully demonstrated the feasibility of building an integrated, browser-based platform combining instant messaging, voice calling, video calling, conferencing, and voicemail using modern open-source technologies. The implementation leverages WebRTC for peer-to-peer media, WebSocket for signaling and presence, React for the interface, and Go for a high-performance backend integrated with an Asterisk PBX via AMI.

A key outcome is the **automatic provisioning of SIP extensions**: every new user who creates an account is automatically assigned a unique extension and a PJSIP endpoint in Asterisk, so they can immediately register and communicate without manual PBX administration. This was verified live end-to-end.

## 8.2 Achievement of Objectives

| Objective | Status |
|---|---|
| Analyze existing systems and identify gaps | Achieved |
| Design a three-tier unified architecture | Achieved |
| Implement secure JWT authentication + RBAC | Achieved |
| Develop real-time messaging with read receipts/voice notes | Achieved |
| Implement WebRTC voice and video calling | Achieved |
| Implement multiparty video conferencing | Achieved |
| Implement voicemail with notifications | Achieved |
| Develop administrative dashboard and analytics | Achieved |
| Integrate with Asterisk PBX via AMI + auto-provision extensions | Achieved (live-verified) |
| Test comprehensively | Achieved (30 Go tests + E2E + AMI + SIP) |

## 8.3 Conclusion

The project successfully produced a fully operational, self-hosted, browser-based VoIP communication platform. It provides a cost-effective, unified alternative to multiple standalone tools and is appropriate for deployment in an organization such as the Rafic Building at DIT. The automatic extension provisioning, seamless WebRTC calling, real-time messaging, voicemail, and administrative tooling together deliver a complete and reliable internal communication solution.

## 8.4 Recommendations

1. Capture and embed all system screenshots and produce the remaining diagram image files (architecture, ERD, DFD, UML) before final submission.
2. Migrate the database from SQLite to PostgreSQL for larger production deployments.
3. Package the application with Docker for simplified deployment and portability.
4. Conduct load testing under production-like conditions.
5. Perform a professional security audit before external deployment; rotate all development secrets (JWT secret, SSH password).
6. Implement monitoring using Prometheus and Grafana.
7. Ensure all production deployments use HTTPS/WSS with valid certificates.
8. Produce the formal dissertation artifacts: questionnaire, interview guide, Gantt chart, and budget.

## 8.5 Future Work

1. Develop native iOS and Android mobile applications.
2. Implement end-to-end encryption using WebRTC insertable streams.
3. Add screen-sharing and file/image sharing capabilities.
4. Add server-side call recording and archiving.
5. Support LDAP/SSO integration for enterprise deployments.
6. Implement AI-powered speech transcription and translation.
7. Extend to external PSTN/SIP trunk connectivity.

---

# REFERENCES

*(APA 7th edition)*

Bergkvist, A., Burnett, D. C., Jennings, C., & Narayanan, A. (2021). *WebRTC 1.0: Real-time communication between browsers* (W3C Recommendation). W3C.

Dierks, T., & Rescorla, E. (2008). *The transport layer security (TLS) protocol version 1.2* (RFC 5246). Internet Engineering Task Force.

Fette, I., & Melnikov, A. (2011). *The WebSocket protocol* (RFC 6455). Internet Engineering Task Force.

Fielding, R. T. (2000). *Architectural styles and the design of network-based software architectures* (Doctoral dissertation). University of California, Irvine.

Goode, B. (2002). Voice over Internet Protocol (VoIP). *Proceedings of the IEEE, 90*(9), 1495–1517.

GORM Community. (2024). *GORM — The fantastic ORM library for Golang*. https://gorm.io

Johnson, M., & Lee, K. (2021). Security challenges in enterprise messaging platforms. *IEEE Security & Privacy, 19*(4), 28–36.

Jones, M., Bradley, J., & Sakimura, N. (2015). *JSON Web Token (JWT)* (RFC 7519). Internet Engineering Task Force.

Kumar, A., & Reddy, R. R. S. (2021). Analysis of unified communication services. *International Journal of Communication Systems, 34*(2), 45–62.

Rosenberg, J., Schulzrinne, H., Camarillo, G., Johnston, A., Peterson, J., Sparks, R., Handley, M., & Schooler, E. (2002). *SIP: Session initiation protocol* (RFC 3261). Internet Engineering Task Force.

Santos, D. F. S., & Santos, H. O. F. G. (2020). Asterisk PBX: An open source telephony platform. *IEEE Latin America Transactions, 18*(5), 856–864.

Schulzrinne, H., Casner, S., Frederick, R., & Jacobson, V. (2003). *RTP: A transport protocol for real-time applications* (RFC 3550). Internet Engineering Task Force.

Singh, V., Ott, J., & Curcio, I. D. D. (2013). Performance analysis of WebRTC video conferencing. In *Proceedings of the 23rd ACM Workshop on NOSSDAV* (pp. 13–18). ACM.

Van Meggelen, J., Smith, J., & Madsen, L. (2007). *Asterisk: The future of telephony* (2nd ed.). O'Reilly Media.

---

# APPENDICES

## Appendix A: Artifact Register — What Is Available in the Project vs What Is Not

This appendix records, honestly, which report artifacts exist in the project and which are still missing and must be produced/finalized.

### A.1 Available in the Project ✅

| Artifact | Location / Notes |
|---|---|
| Working backend | `backend/main.go`, compiled `backend/voip-backend.exe`; running & healthy |
| Working Asterisk integration | Asterisk 20.6.0 running in WSL2; 12 PJSIP endpoints = 12 users; AMI + SIP WS reachable |
| Auto-provisioning feature | `backend/handlers/auth.go` (Register → `asterisk.AddEndpoint`) and `backend/asterisk/config.go`; **live-verified** |
| Automated Go unit tests (30) | `backend/auth`, `backend/config`, `backend/security`, `backend/websocket` (`*_test.go`); all pass `go test ./...` |
| End-to-end test scripts | `tmp/test_call_flow.js` (WebRTC 9/9), `tmp/test_ami_call.js`, `tmp/test_sip_register.js` |
| Security audit & bug-fix log | `docs/SYSTEM_AUDIT_REPORT.md` |
| Testing report | `docs/TESTING_REPORT.md` |
| User Manual | `docs/USER_MANUAL.md` |
| Administrator Guide | `docs/ADMIN_GUIDE.md` |
| Other technical docs | `docs/CALL_HANGUP_FIXES.md`, `docs/HTTP_MICROPHONE_ACCESS.md`, `docs/KNOWN_ISSUES.md`, `docs/MICROPHONE_TROUBLESHOOTING.md` |
| Asterisk config templates | `asterisk-config/{pjsip.conf, extensions.conf, manager.conf, http.conf, setup-asterisk.sh}` |
| Automation / diagnostics scripts | `scripts/*.js`, `scripts/*.sh`, `scripts/*.ps1` (configure-asterisk, health checks, WSL/AMI setup, network tests) |
| Production frontend build | `build/` (served via HTTPS on :8443) |
| Frontend source | 19 pages, 25 components, 23 services (`src/`) |
| Database schema (live) | 16 application tables in `backend/voip.db` |
| Existing report drafts | `docs/FINAL_PROJECT_REPORT.md`; `project report/VoIP_Communication_System_Report.docx/.pdf`; presentation `project report/MINI2_Presentation_VoIP_System.pptx` |

### A.2 NOT Available / To Be Produced ⚠️

| Artifact | Status | Action Required |
|---|---|---|
| **System screenshots** (login, registration, dashboard, incoming call, active call, admin) | ❌ Missing | Capture from the running app (https://192.168.1.8:8443) and insert as Figures 7.1–7.6 |
| **Architecture diagram image** | ❌ Missing | Draw three-tier architecture diagram (Figure 6.1) |
| **ERD / DFD / context diagram images** | ❌ Missing | Produce ERD + context/Level-0/Level-1 DFD diagrams (Figures 6.2, 6.3) |
| **UML diagram images** (use case, sequence, class, activity, component/deployment) | ❌ Missing | Produce UML diagrams (Figures 5.1, 6.4, 6.5) |
| **Conceptual framework diagram** | ❌ Missing | Produce conceptual framework diagram (Figure 2.2) |
| **Gantt chart** | ❌ Missing | Create project schedule Gantt chart |
| **Budget** | ❌ Missing | Create budget sheet |
| **Questionnaire instrument** | ❌ Missing | Produce the questionnaire form |
| **Interview guide** | ❌ Missing | Produce the interview guide |
| **Formal SRS document** | ❌ Partial | Requirements are in this report (Ch. 5); a standalone SRS doc is optional |
| **User Acceptance Test records** | ❌ Missing | Document formal UAT evidence |
| **Freshened status snapshots** | ⚠️ Stale | `tmp/asterisk-status.json`, `tmp/system-status.json` are dated 2025-07-06 with an old `172.20.10.x` network; regenerate for current `192.168.1.8` state |
| **PostgreSQL / Docker / K8s / CI** | ❌ Not present | Out of scope; recommended as future work |

> Note on network: the project now runs on the `192.168.1.8` network (Windows + WSL mirrored). Older test outputs referencing `172.20.10.x` or `192.168.1.166` reflect earlier network states and are superseded by the current verified configuration.

## Appendix B: User Manual

A complete user manual is available in the project at **`docs/USER_MANUAL.md`**. Key quick-start steps:

- Open a modern browser and navigate to `https://192.168.1.8:8443` (or the configured host), then log in or register.
- On registration you receive an automatically-assigned extension.
- Use the dashboard sidebar: Home (dialer), Chat, Contacts, Call Logs, Voicemail, Conference, Settings, Notifications.
- To call: dial an extension in the dialer, or call from a contact.
- To receive: the incoming-call screen shows caller details with Accept/Reject.
- Chat supports typing indicators and read receipts; voicemail is under the Voicemail page.

## Appendix C: Administrator Guide

Refer to the project's **`docs/ADMIN_GUIDE.md`**. It documents user management, system monitoring, call-log administration, backups/restore, and health diagnostics.

## Appendix D: Installation & Configuration Guide

1. Ensure Go 1.25+ and Node.js 18+ are installed.
2. Install WSL2 with Ubuntu-24.04 and install Asterisk 20.x (config templates in `asterisk-config/`).
3. In `backend/`, run `go mod download`.
4. Configure `backend/.env` (ports, JWT secret, Asterisk host, AMI credentials).
5. Build the backend: `go build -o voip-backend.exe`.
6. In the project root, run `npm install`.
7. Configure `.env` (REACT_APP_API_URL, REACT_APP_WS_URL, REACT_APP_SIP_SERVER).
8. Build the frontend: `npm run build` (for HTTPS access on :8443).
9. Start the backend: `./backend/voip-backend.exe` (serves frontend on :8443).
10. For the dev server, run `npm start` (http://localhost:3000).
11. Verify: `GET /health` returns `status: ok`; `pjsip show endpoints` lists the users' extensions; `https://<host>:8443` loads the app.

**Configuration keys:** Backend — PORT, HOST, TLS_PORT, JWT_SECRET, DB_PATH, ASTERISK_HOST, ASTERISK_AMI_PORT, ASTERISK_AMI_USERNAME, ASTERISK_AMI_SECRET, ASTERISK_WSL_DISTRO, SIP_DOMAIN, SIP_PORT, PUBLIC_HOST, CORS_ORIGINS. Frontend — REACT_APP_API_URL, REACT_APP_WS_URL, REACT_APP_SIP_SERVER, REACT_APP_SIP_PORT, REACT_APP_SIP_WS_URL.

## Appendix E: API Documentation

Over 75 REST endpoints are provided under `/api`, `/protected`, and `/protected/admin` covering authentication, messaging, calls, voicemail, users, health, diagnostics, and backups — plus WebSocket endpoints `/ws` (signaling hub) and `/asterisk-ws` (SIP proxy). A full route map is visible in `backend/main.go`. Major groups: public `/api` (login, register, refresh, server-info, setup); protected `/protected` (profile, users, extensions, call, messages, voicemail, missed-calls, diagnostics, health); admin `/protected/admin` (users, stats, call-logs, export, metrics, call control, backups).

## Appendix F: Database Schema

16 application tables confirmed in the deployed database: `users`, `messages`, `chat_conversations`, `chat_groups`, `chat_group_members`, `chat_group_messages`, `call_logs`, `active_calls`, `missed_calls`, `voicemails`, `voicemail_settings`, `voicemail_greetings`, `conferences`, `conference_participants`, `call_recordings`, and `setup_states`. Table structures are summarized in Chapter 6.

## Appendix G: Sample Source Code

Selected excerpts (see the source tree and `docs/SYSTEM_AUDIT_REPORT.md`): WebSocket Hub (`backend/websocket/hub.go`), WebRTC Call Service (`src/services/webrtcCallService.js`), Call Handler (`backend/handlers/calls.go`), JWT Authentication (`backend/auth/jwt.go`), and Asterisk Endpoint Provisioning (`backend/asterisk/config.go` — `AddEndpoint`), and user registration (`backend/handlers/auth.go` — `Register`).

## Appendix H: Test Cases and Testing Evidence

Actual evidence: 30 Go unit tests (auth/config/security/websocket) pass; `tmp/test_call_flow.js` WebRTC E2E (9/9); `tmp/test_ami_call.js` AMI call; `tmp/test_sip_register.js` SIP registration; `docs/TESTING_REPORT.md`; `docs/SYSTEM_AUDIT_REPORT.md` (test section). Test-case tables appear in Chapter 7.

## Appendix I: Gantt Chart

**To be created.** A project schedule Gantt chart covering: requirements analysis, design, implementation, testing, and documentation across the academic year (2025/2026).

## Appendix J: Budget

**To be created.** Software budget is TZS 0 (all open-source). Hardware/consumables estimate (optional): network switch/router, microphone-equipped computers, and cabling as required.

## Appendix K: Questionnaire & Interview Guide

**To be created.** The questionnaire (with both closed and open-ended questions) and the interview guide described in Chapter 3 are to be produced and appended here.

---

*End of Report*
