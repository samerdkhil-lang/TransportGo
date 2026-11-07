# 📊 Rapport d'Avancement des Sprints - Projet TransportGo

**Projet :** Application de Gestion & Réservation de Transport  (TransportGo)  
**Étudiant / Développeur :** Samer Dkhil  + ahmednour hkiri
**Période :** Du 19 Octobre 2026 au 07 Novembre 2026 (3 semaines)  
**Dépôt GitHub :** [https://github.com/samerdkhil-lang/TransportGo](https://github.com/samerdkhil-lang/TransportGo)

---

## 📅 Vue Synthétique des Sprints

| Sprint | Période | Axe de travail | Livrable principal | Statut |
| :---: | :---: | :--- | :--- | :---: |
| **Sprint 1** | 19/10/2026 – 25/10/2026 | **Présentation et Fondamentaux Node.js** | Support de présentation & infographie des notions clés | **Terminé** (100%) |
| **Sprint 2** | 26/10/2026 – 01/11/2026 | **Architecture Réseau (Ubuntu/Windows) & Modélisation UML** | Schéma réseau (tunnel SSH/MySQL) & Diagrammes UML | **Terminé** (100%) |
| **Sprint 3** | 02/11/2026 – 07/11/2026 | **Développement de l'API de Réservation, Validation & Déploiement** | Application complète, API fonctionnelle, Documentation & Git | **Terminé** (100%) |

---

## 🚀 Détail des Réalisations par Sprint

---

### 🔹 Sprint 1 : Présentation & Fondamentaux Node.js
* **Dates :** Du Lundi 19 Octobre 2026 au Dimanche 25 Octobre 2026 (1 semaine)
* **Objectif :** Maîtriser l'écosystème Node.js, son architecture d'exécution et ses paradigmes asynchrones avant d'entamer le développement de l'application.

#### Travaux réalisés :
1. **Étude approfondie du moteur Node.js :**
   - Fonctionnement du moteur V8 et de la boucle d'événements (**Event Loop**).
   - Gestion des I/O non bloquantes et du multi-threading interne (libuv).
   - Comparaison entre modules CommonJS (`require`) et ECMAScript Modules (`import`).
2. **Initialisation de l'environnement backend :**
   - Mise en place du gestionnaire de paquets `npm` et initialisation du `package.json`.
   - Prise en main du framework **Express.js** et de l'architecture middleware.
3. **Livrables :**
   - Présentation PowerPoint & infographie structurée sur les notions clés de Node.js.
   - Squelette technique de démarrage avec configuration des scripts (`dev`, `start`).

---

### 🔹 Sprint 2 : Connexion Réseau Ubuntu / Windows & Conception UML
* **Dates :** Du Lundi 26 Octobre 2026 au Dimanche 1er Novembre 2026 (1 semaine)
* **Objectif :** Établir l'infrastructure réseau multi-environnements entre Windows et Ubuntu, et modéliser l'ensemble des besoins fonctionnels et techniques du système.

#### Travaux réalisés :
1. **Architecture Réseau & Intégration Inter-systèmes :**
   - Installation et configuration du serveur distant Linux (Ubuntu 22.04 LTS / IP : `192.168.0.120`).
   - Mise en place de la base de données relationnelle **MySQL Server 8.0** sur Ubuntu.
   - Sécurisation des accès par **Tunneling SSH** chiffré depuis le poste hôte Windows vers Ubuntu :
     ```bash
     ssh -N -L 3307:127.0.0.1:3306 samer@192.168.0.120
     ```
   - Configuration et validation de l'outil d'administration **DBeaver** connecté au port forwarded `3307`.
2. **Conception & Modélisation UML :**
   - **Diagramme de Cas d'Utilisation (Use Cases) :** identification des 3 acteurs majeurs :
     - *Client :* Recherche de trajets, sélection de siège, réservation, consultation du billet QR Code, annulation.
     - *Chauffeur :* Consultation des passagers assignés, contrôle et validation d'embarquement.
     - *Administrateur :* Gestion du parc de bus, planification des trajets, affectation des chauffeurs et gestion des rôles.
   - **Diagramme de Classes Métier & Schéma Relationnel :**
     - Conception des entités `Users`, `Vehicles`, `Trips`, et `Reservations`.
     - Intégration d'une colonne générée unique `seat_lock` empêchant matériellement tout surbooking de place.
3. **Livrables :**
   - Script SQL complet initialisé (`schema.sql`) avec contraintes d'intégrité, clés étrangères et index.
   - Modélisation UML validée et tunnel réseau opérationnel.

---

### 🔹 Sprint 3 : Développement de l'API de Réservation, Validation & Déploiement
* **Dates :** Du Lundi 2 Novembre 2026 au Samedi 7 Novembre 2026 (1 semaine)
* **Axe de travail :** *Validation de l’application et développement de l’API de réservation.*
* **Objectif :** Développer les services backend, implémenter les interfaces interactives client et chauffeur, corriger les anomalies et déployer l'application sur un environnement commun.

#### Travaux réalisés :

#### 1. Développement Backend Node.js / Express
- **Module d'Authentification & Sécurité (`/api/auth`) :**
  - Hashage sécurisé des mots de passe avec **bcrypt** (salt rounds 10).
  - Génération et vérification de tokens **JWT** (JSON Web Tokens).
  - Middleware de contrôle d'accès par rôle (**RBAC**) filtrant les accès (`client`, `driver`, `admin`).
- **API Complète de Réservation (`/api/reservations`) :**
  - `POST /api/reservations` : Réservation atomique avec génération de code unique formaté (`RES-XXXXXXXXXX`).
  - `GET /api/reservations/mine` : Historique des billets du passager connecté.
  - `GET /api/reservations/:code` : Recherche sécurisée par code de réservation.
  - `PATCH /api/reservations/:code/cancel` : Annulation soumise aux règles métier (interdite après départ ou validation).
  - `POST /api/reservations/:code/validate` : Validation de l'embarquement par le chauffeur assigné au trajet.
- **Gestion des Trajets & Véhicules (`/api/trips`, `/api/vehicles`, `/api/users`) :**
  - Recherche multicritère (départ, destination, date) avec calcul en temps réel des places disponibles.
  - Planification et suivi de statut des trajets (`planned`, `departed`, `completed`, `cancelled`).

#### 2. Développement Frontend React (Vite & React Router 7)
- **Expérience Passager / Client :**
  - Recherche dynamique des trajets avec calcul automatique des disponibilités.
  - Page de détail avec **plan interactif du bus** en 2x2 avec allée centrale, distinction visuelle des places libres/occupées/sélectionnées.
  - Espace "Mes réservations" avec rendu dynamique du **QR Code SVG** (`qrcode.react`) pour le scan à l'embarquement.
- **Espace Chauffeur & Gestion :**
  - Tableau de bord "Mes trajets" avec liste détaillée des passagers par siège.
  - Écran de validation dédié au chauffeur pour vérifier l'authenticité des billets et valider l'embarquement en un clic.
- **Espace Administrateur :**
  - Gestion du parc de véhicules et modification des rôles utilisateurs.

#### 3. Validation Fonctionnelle & Résolution d'Anomalies
- Résolution des problèmes de casse de fichiers sous Linux (`Auth.js` -> `auth.js`).
- Nettoyage et séparation stricte de l'arborescence (dossier `src/` réservé au backend, `client/` au frontend).
- Correction du typage des identifiants et des désassignations de chauffeurs.
- Audit de code avec **oxlint** et validation du build de production (`vite build`).

#### 4. Documentation & Déploiement
- **Documentation REST complète :** Description de chaque endpoint, paramètres, codes d'erreur et exemples de payloads dans le `README.md`.
- **Déploiement GitHub :** Code source unifié et synchronisé sur la branche `main` de GitHub.
- **Configuration Déploiement Web :** Fichiers `vercel.json` et `Procfile` configurés avec gestion CORS multi-domaines.

---

## 📈 Bilan du Projet au Terme du Sprint 3

| Composant | Statut | Commentaire |
| :--- | :---: | :--- |
| **Backend API (Node.js/Express)** | ✅ 100% | Toutes les routes REST et sécurités RBAC sont fonctionnelles. |
| **Base de Données (MySQL 8.0)** | ✅ 100% | Schéma déployé, contraintes anti-doublon et données de test prêtes. |
| **Frontend Web (React/Vite)** | ✅ 100% | Parcours Client et Chauffeur complètement implémentés et testés. |
| **Documentation & Schémas** | ✅ 100% | `README.md` exhaustif avec guides de test et endpoints documentés. |
| **Versioning Git & CI/CD** | ✅ 100% | Dépôt GitHub à jour avec protection des variables sensibles (`.env`). |

