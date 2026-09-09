"""Seed the database with the reference data that used to be hard-coded in the
frontend (dimensions, sub-dimensions, questions, banks, departments, roles,
maturity levels, recommendations).

Run after applying migrations:

    python -m app.db.seed            # insert only into empty tables (idempotent)
    python -m app.db.seed --reset    # wipe those reference tables, then reseed

It never touches the submission tables (assessments / answers / dimension_scores).
"""

import asyncio
import sys

from sqlalchemy import delete, func, select

from app.db.database import AsyncSessionLocal
from app.models import (
    Bank,
    Department,
    Dimension,
    MaturityLevel,
    Question,
    Recommendation,
    Role,
    SubDimension,
)
from app.models.question import DEFAULT_QUESTION_TYPE

# --- Reference data ----------------------------------------------------------
#
# Each dimension has one sub-dimension per evaluated topic; each topic carries
# exactly one questionnaire item plus its ladder of 4 atomic recommendations
# (level 1->2, 2->3, 3->4, 4->5). Weights are whole-number percentages of the
# global score and sum to 100 across the 6 dimensions.

DIMENSIONS = [
    {
        "key": "strategie",
        "code": "D1",
        "name": "Alignement stratégique & Business",
        "short_name": "Stratégie",
        "description": "Sponsoring exécutif, priorisation et valeur business des initiatives data.",
        "weight": 15,
        "color": "#1A1A1A",
        "topics": [
            {
                "name": "Sponsoring exécutif",
                "question": "Quel est le niveau d'engagement de la Direction générale sur les sujets data ?",
                "level_responses": [
                    {"label": "La Direction générale n'est pas impliquée.", "score": 1},
                    {"label": "Elle intervient seulement en cas de besoin urgent.", "score": 2},
                    {"label": "Un responsable de direction est désigné pour soutenir les initiatives data.", "score": 3},
                    {"label": "La Direction générale suit régulièrement les projets, les risques et les résultats data.", "score": 4},
                    {"label": "La data est intégrée aux décisions stratégiques de la banque.", "score": 5},
                ],
                "recommendations": [
                    (2, "Identifier un relais data à la Direction générale",
                     "Désigner un interlocuteur à la Direction générale mobilisable sur les sujets data critiques, afin de sortir d'une absence totale d'implication.", "strategie", False, 1),
                    (3, "Nommer un sponsor exécutif data",
                     "Désigner formellement un membre de la direction comme sponsor chargé de soutenir et de porter les initiatives data.", "strategie", False, 1),
                    (4, "Instaurer un suivi régulier par la Direction générale",
                     "Mettre en place des revues périodiques de la DG sur les projets, les risques et les résultats data.", "strategie", False, 2),
                    (5, "Intégrer la data aux décisions stratégiques",
                     "Ancrer la donnée dans les processus de décision stratégique de la banque et instaurer un pilotage continu par la Direction générale.", "strategie", False, 3),
                ],
            },
            {
                "name": "Roadmap et priorisation",
                "question": "Comment les initiatives data sont-elles planifiées et priorisées ?",
                "level_responses": [
                    {"label": "Elles sont lancées sans plan ni critères de priorité.", "score": 1},
                    {"label": "Chaque direction gère ses propres initiatives.", "score": 2},
                    {"label": "Une roadmap data commune est définie.", "score": 3},
                    {"label": "Les initiatives sont priorisées selon leur valeur, leur risque et les exigences réglementaires.", "score": 4},
                    {"label": "La roadmap est régulièrement mise à jour selon les résultats et les priorités de la banque.", "score": 5},
                ],
                "recommendations": [
                    (2, "Recenser les initiatives data existantes",
                     "Inventorier les initiatives data menées par chaque direction pour obtenir une première visibilité d'ensemble.", "strategie", False, 1),
                    (3, "Construire une roadmap data commune",
                     "Consolider les initiatives des différentes directions dans une roadmap data partagée à l'échelle de la banque.", "strategie", False, 2),
                    (4, "Prioriser selon valeur, risque et réglementation",
                     "Prioriser les initiatives de la roadmap selon leur valeur métier, leur niveau de risque et les exigences réglementaires.", "strategie", True, 2),
                    (5, "Mettre la roadmap sous revue continue",
                     "Réviser périodiquement la roadmap en fonction des résultats obtenus et de l'évolution des priorités de la banque.", "strategie", False, 2),
                ],
            },
            {
                "name": "Valeur et impact business",
                "question": "Comment la banque mesure-t-elle la valeur de ses projets data ?",
                "level_responses": [
                    {"label": "La valeur des projets data n'est pas mesurée.", "score": 1},
                    {"label": "Les bénéfices sont estimés de manière informelle.", "score": 2},
                    {"label": "Des objectifs et des indicateurs sont définis pour les principaux projets.", "score": 3},
                    {"label": "Les coûts, les gains et les risques évités sont suivis régulièrement.", "score": 4},
                    {"label": "Les résultats mesurés servent à décider de poursuivre, modifier ou arrêter les projets.", "score": 5},
                ],
                "recommendations": [
                    (2, "Estimer les bénéfices attendus des projets data",
                     "Formaliser une première estimation des bénéfices attendus des principaux projets data, même approximative.", "strategie", False, 1),
                    (3, "Définir objectifs et indicateurs de valeur",
                     "Fixer des objectifs et des indicateurs de valeur pour les projets data majeurs afin d'en mesurer les résultats.", "strategie", False, 2),
                    (4, "Suivre coûts, gains et risques évités",
                     "Mettre en place un suivi régulier des coûts, des gains et des risques évités pour les projets data.", "strategie", False, 2),
                    (5, "Piloter les projets par la valeur mesurée",
                     "Utiliser les résultats mesurés pour décider de poursuivre, d'ajuster ou d'arrêter chaque projet data.", "strategie", False, 2),
                ],
            },
            {
                "name": "Alignement métier et IT",
                "question": "Comment les équipes métier et IT collaborent-elles sur les sujets data ?",
                "level_responses": [
                    {"label": "Elles travaillent séparément.", "score": 1},
                    {"label": "Elles collaborent seulement sur certains projets.", "score": 2},
                    {"label": "Les besoins et les responsabilités sont définis ensemble.", "score": 3},
                    {"label": "Elles suivent ensemble les projets, les problèmes et les résultats.", "score": 4},
                    {"label": "Elles pilotent ensemble les initiatives data de manière continue.", "score": 5},
                ],
                "recommendations": [
                    (2, "Rapprocher métier et IT sur les projets prioritaires",
                     "Organiser des points de collaboration entre les équipes métier et IT sur les projets data prioritaires.", "gouvernance", False, 1),
                    (3, "Définir ensemble besoins et responsabilités",
                     "Définir conjointement, entre métier et IT, les besoins data et la répartition des responsabilités.", "gouvernance", False, 2),
                    (4, "Suivre ensemble projets, incidents et résultats",
                     "Instaurer un suivi conjoint métier-IT des projets, des incidents et des résultats data.", "gouvernance", False, 2),
                    (5, "Piloter en continu les initiatives data à deux",
                     "Mettre en place un pilotage continu et partagé des initiatives data entre métier et IT.", "gouvernance", False, 2),
                ],
            },
        ],
    },
    {
        "key": "gouvernance",
        "code": "D2",
        "name": "Gouvernance & Pilotage",
        "short_name": "Gouvernance",
        "description": "Rôles, politiques, conformité réglementaire et cartographie des données.",
        "weight": 20,
        "color": "#0277BD",
        "topics": [
            {
                "name": "Responsabilités data",
                "question": "Comment les responsabilités liées aux données critiques sont-elles définies dans la banque ?",
                "level_responses": [
                    {"label": "Aucun responsable n'est clairement identifié.", "score": 1},
                    {"label": "Les responsabilités existent de manière informelle dans certaines directions.", "score": 2},
                    {"label": "Des responsables sont officiellement désignés pour les principales données.", "score": 3},
                    {"label": "Les responsabilités sont documentées, suivies et appliquées dans toute la banque.", "score": 4},
                    {"label": "Les rôles sont régulièrement évalués et adaptés aux besoins de la banque.", "score": 5},
                ],
                "recommendations": [
                    (2, "Identifier des référents data par métier",
                     "Identifier, au sein de chaque métier, des référents responsables des données critiques, à titre informel dans un premier temps.", "gouvernance", False, 1),
                    (3, "Nommer des Data Owners sous l'autorité d'un CDO",
                     "Désigner officiellement des Data Owners pour les données critiques et rattacher la démarche à un Chief Data Officer (CDO).", "gouvernance", False, 2),
                    (4, "Formaliser et généraliser les rôles data",
                     "Documenter les rôles de Data Owner et de Data Steward et appliquer ces responsabilités à l'ensemble de la banque.", "gouvernance", False, 2),
                    (5, "Réviser périodiquement les responsabilités data",
                     "Évaluer régulièrement les rôles et responsabilités data et les adapter aux évolutions de l'organisation et des besoins.", "gouvernance", False, 2),
                ],
            },
            {
                "name": "Instances de gouvernance",
                "question": "Comment les décisions liées aux données sont-elles organisées et suivies ?",
                "level_responses": [
                    {"label": "Aucune instance ne traite les sujets data.", "score": 1},
                    {"label": "Les décisions sont prises au cas par cas par les équipes concernées.", "score": 2},
                    {"label": "Une instance ou un comité traite les principaux sujets data.", "score": 3},
                    {"label": "Les décisions, risques et actions data sont suivis régulièrement.", "score": 4},
                    {"label": "Les instances data pilotent activement les priorités, les risques et les améliorations.", "score": 5},
                ],
                "recommendations": [
                    (2, "Traiter les sujets data dans une instance existante",
                     "Inscrire les principaux sujets data à l'ordre du jour d'une instance existante, faute de comité dédié.", "gouvernance", False, 1),
                    (3, "Créer un comité de gouvernance des données",
                     "Mettre en place un comité de gouvernance des données réunissant métiers, IT et conformité pour arbitrer les sujets data.", "gouvernance", False, 2),
                    (4, "Suivre décisions, risques et actions data en comité",
                     "Assurer un suivi régulier en comité des décisions, des risques et des plans d'action data.", "gouvernance", False, 2),
                    (5, "Faire du comité data un organe de pilotage actif",
                     "Positionner le comité de gouvernance des données comme organe de pilotage actif des priorités, des risques et des améliorations.", "gouvernance", False, 2),
                ],
            },
            {
                "name": "Cadre de gouvernance",
                "question": "La banque dispose-t-elle d'un cadre formel pour gérer ses données ?",
                "level_responses": [
                    {"label": "Aucun cadre de gouvernance des données n'existe.", "score": 1},
                    {"label": "Quelques règles existent séparément dans certaines directions.", "score": 2},
                    {"label": "Un cadre commun définit les rôles, règles et responsabilités.", "score": 3},
                    {"label": "Le cadre est appliqué, suivi et mis à jour régulièrement.", "score": 4},
                    {"label": "Le cadre est continuellement amélioré selon les risques et les besoins de la banque.", "score": 5},
                ],
                "recommendations": [
                    (2, "Formaliser les premières règles de gestion des données",
                     "Documenter les premières règles de gestion des données au sein des directions les plus concernées.", "gouvernance", False, 1),
                    (3, "Adopter une politique de gouvernance des données",
                     "Définir une politique (charte) de gouvernance des données commune fixant rôles, règles et responsabilités.", "gouvernance", False, 2),
                    (4, "Appliquer et contrôler le cadre de gouvernance",
                     "Déployer la politique de gouvernance, en contrôler l'application et la mettre à jour régulièrement.", "gouvernance", False, 2),
                    (5, "Améliorer en continu le dispositif de gouvernance",
                     "Faire évoluer en continu le cadre de gouvernance selon les risques et les besoins de la banque.", "gouvernance", False, 2),
                ],
            },
            {
                "name": "Catalogue et définitions des données",
                "question": "Les données critiques sont-elles clairement définies et documentées ?",
                "level_responses": [
                    {"label": "Les données critiques ne sont pas clairement identifiées.", "score": 1},
                    {"label": "Certaines définitions existent, mais elles sont dispersées.", "score": 2},
                    {"label": "Les principales données critiques sont définies et documentées.", "score": 3},
                    {"label": "Les définitions sont partagées, utilisées et associées à des responsables.", "score": 4},
                    {"label": "Le catalogue de données est régulièrement enrichi, contrôlé et mis à jour.", "score": 5},
                ],
                "recommendations": [
                    (2, "Recenser les données critiques",
                     "Établir un premier inventaire des données critiques de la banque, même partiel et dispersé.", "gouvernance", False, 1),
                    (3, "Constituer un dictionnaire des données",
                     "Définir et documenter les principales données critiques dans un dictionnaire de données commun.", "gouvernance", False, 2),
                    (4, "Associer les définitions à des Data Owners",
                     "Partager le dictionnaire de données, l'utiliser dans les métiers et rattacher chaque donnée à un Data Owner.", "gouvernance", False, 2),
                    (5, "Maintenir une cartographie des données vivante",
                     "Enrichir, contrôler et mettre à jour régulièrement le catalogue et la cartographie des données critiques.", "gouvernance", False, 2),
                ],
            },
            {
                "name": "Conformité réglementaire",
                "question": "Comment les exigences réglementaires liées aux données sont-elles prises en compte ?",
                "level_responses": [
                    {"label": "Elles sont traitées uniquement lorsqu'un problème apparaît.", "score": 1},
                    {"label": "Elles sont gérées séparément par les équipes concernées.", "score": 2},
                    {"label": "Les principales exigences sont recensées et attribuées à des responsables.", "score": 3},
                    {"label": "Des contrôles réguliers vérifient leur respect et les écarts sont corrigés.", "score": 4},
                    {"label": "Les évolutions réglementaires sont anticipées et intégrées rapidement.", "score": 5},
                ],
                "recommendations": [
                    (2, "Structurer la prise en charge de la conformité data",
                     "Prendre en charge les exigences réglementaires liées aux données dès qu'un problème est identifié, en attendant un dispositif structuré.", "gouvernance", True, 1),
                    (3, "Recenser les exigences réglementaires data",
                     "Recenser les principales exigences réglementaires (reporting réglementaire BCT, LCB-FT, secret bancaire) et les attribuer à des responsables.", "gouvernance", True, 2),
                    (4, "Contrôler régulièrement la conformité",
                     "Mettre en place des contrôles réguliers du respect des exigences réglementaires et corriger les écarts constatés.", "gouvernance", True, 2),
                    (5, "Anticiper les évolutions réglementaires",
                     "Assurer une veille réglementaire et intégrer rapidement les évolutions dans les dispositifs data.", "gouvernance", True, 3),
                ],
            },
            {
                "name": "Classification des données",
                "question": "Les données sont-elles classées selon leur sensibilité ?",
                "level_responses": [
                    {"label": "Les données ne sont pas classées.", "score": 1},
                    {"label": "Certaines données sensibles sont identifiées de manière informelle.", "score": 2},
                    {"label": "Une classification commune distingue les données publiques, internes, confidentielles ou sensibles.", "score": 3},
                    {"label": "La classification est appliquée et utilisée pour définir les règles de protection.", "score": 4},
                    {"label": "La classification est régulièrement revue selon les risques, usages et obligations réglementaires.", "score": 5},
                ],
                "recommendations": [
                    (2, "Identifier les données sensibles et personnelles",
                     "Repérer, de façon informelle, les données sensibles et à caractère personnel les plus exposées.", "securite", True, 1),
                    (3, "Adopter une politique de classification des données",
                     "Définir une politique de classification distinguant données publiques, internes, confidentielles, sensibles et à caractère personnel.", "securite", True, 2),
                    (4, "Appliquer la classification aux règles de protection",
                     "Appliquer la classification pour définir les règles de protection (habilitations, chiffrement) selon le niveau de sensibilité.", "securite", True, 2),
                    (5, "Réviser la classification selon risques et réglementation",
                     "Réviser régulièrement la classification selon les risques, les usages et les obligations réglementaires (secret bancaire, protection des données à caractère personnel).", "securite", True, 2),
                ],
            },
            {
                "name": "Conservation et archivage",
                "question": "Comment la banque gère-t-elle la conservation, l'archivage et la suppression des données ?",
                "level_responses": [
                    {"label": "Il n'existe pas de règles claires.", "score": 1},
                    {"label": "Les pratiques varient selon les directions.", "score": 2},
                    {"label": "Des règles de conservation et d'archivage sont définies.", "score": 3},
                    {"label": "Leur application est contrôlée et les écarts sont suivis.", "score": 4},
                    {"label": "La conservation, l'archivage et la suppression sont automatisés et régulièrement contrôlés.", "score": 5},
                ],
                "recommendations": [
                    (2, "Clarifier les pratiques de conservation",
                     "Documenter les pratiques de conservation existantes pour réduire l'hétérogénéité entre directions.", "gouvernance", True, 1),
                    (3, "Définir une politique de rétention des données",
                     "Établir des règles de conservation, d'archivage légal et de purge des données conformes aux obligations réglementaires.", "gouvernance", True, 2),
                    (4, "Contrôler l'application des règles de rétention",
                     "Contrôler l'application des règles de conservation et d'archivage et suivre les écarts.", "gouvernance", True, 2),
                    (5, "Automatiser conservation, archivage et purge",
                     "Automatiser la conservation, l'archivage et la suppression des données, avec des contrôles réguliers.", "gouvernance", True, 3),
                ],
            },
        ],
    },
    {
        "key": "qualite",
        "code": "D3",
        "name": "Gestion de la qualité des données",
        "short_name": "Qualité",
        "description": "Exactitude, cohérence, traçabilité et amélioration continue de la donnée.",
        "weight": 20,
        "color": "#2E7D32",
        "topics": [
            {
                "name": "Contrôle à la saisie",
                "question": "Comment la banque contrôle-t-elle la qualité des données dès leur saisie ou leur réception ?",
                "level_responses": [
                    {"label": "Aucun contrôle précis n'est réalisé.", "score": 1},
                    {"label": "Les erreurs sont corrigées manuellement lorsqu'elles sont détectées.", "score": 2},
                    {"label": "Des règles de complétude, d'exactitude et de validité sont définies pour les données critiques.", "score": 3},
                    {"label": "Les contrôles sont automatisés et les données incorrectes sont signalées.", "score": 4},
                    {"label": "Les erreurs sont bloquées ou corrigées dès leur création et les règles sont régulièrement améliorées.", "score": 5},
                ],
                "recommendations": [
                    (2, "Corriger les erreurs constatées à la saisie",
                     "Mettre en place une correction systématique des erreurs de données constatées à la saisie ou à la réception.", "qualite", False, 1),
                    (3, "Définir des règles de contrôle qualité à la saisie",
                     "Formaliser des règles de complétude, d'exactitude et de validité pour les données critiques.", "qualite", False, 2),
                    (4, "Automatiser les contrôles de qualité",
                     "Automatiser les contrôles à la saisie et signaler automatiquement les données non conformes.", "qualite", False, 2),
                    (5, "Bloquer les erreurs à la source",
                     "Bloquer ou corriger les données erronées dès leur création et améliorer régulièrement les règles de contrôle.", "qualite", False, 3),
                ],
            },
            {
                "name": "Cohérence",
                "question": "Comment la banque vérifie-t-elle que les données sont cohérentes entre ses systèmes et ses reportings ?",
                "level_responses": [
                    {"label": "Les écarts entre les systèmes sont fréquents et non contrôlés.", "score": 1},
                    {"label": "Les écarts sont corrigés manuellement au cas par cas.", "score": 2},
                    {"label": "Des règles de rapprochement sont définies pour les données critiques.", "score": 3},
                    {"label": "Les écarts sont détectés automatiquement et suivis jusqu'à leur correction.", "score": 4},
                    {"label": "Les contrôles préviennent les écarts entre les systèmes, la comptabilité et les reportings.", "score": 5},
                ],
                "recommendations": [
                    (2, "Corriger les écarts entre systèmes",
                     "Traiter au cas par cas les écarts de données constatés entre les systèmes, la comptabilité et les reportings.", "qualite", True, 2),
                    (3, "Définir des règles de rapprochement",
                     "Établir des règles de rapprochement des données critiques entre systèmes et avec la comptabilité.", "qualite", True, 2),
                    (4, "Automatiser la détection des écarts",
                     "Détecter automatiquement les écarts inter-systèmes et les suivre jusqu'à leur correction.", "qualite", True, 2),
                    (5, "Prévenir les écarts sur le reporting réglementaire",
                     "Mettre en place des contrôles préventifs garantissant la cohérence entre systèmes, comptabilité et reportings réglementaires.", "qualite", True, 3),
                ],
            },
            {
                "name": "Unicité",
                "question": "Comment la banque évite-t-elle les doublons et les différentes versions d'une même donnée ?",
                "level_responses": [
                    {"label": "Les doublons sont fréquents et ne sont pas contrôlés.", "score": 1},
                    {"label": "Ils sont supprimés manuellement lorsqu'ils sont détectés.", "score": 2},
                    {"label": "Des règles de détection des doublons sont définies.", "score": 3},
                    {"label": "Les doublons sont détectés et traités automatiquement.", "score": 4},
                    {"label": "Des identifiants et référentiels communs empêchent leur création.", "score": 5},
                ],
                "recommendations": [
                    (2, "Supprimer les doublons détectés",
                     "Supprimer les doublons de données dès qu'ils sont identifiés.", "qualite", False, 1),
                    (3, "Définir des règles de détection des doublons",
                     "Formaliser des règles de détection des doublons sur les données critiques.", "qualite", False, 2),
                    (4, "Automatiser le dédoublonnage",
                     "Détecter et traiter automatiquement les doublons et les versions multiples d'une même donnée.", "qualite", False, 2),
                    (5, "Instaurer un référentiel client unique",
                     "Mettre en place des identifiants et des référentiels communs (référentiel client unique) empêchant la création de doublons.", "qualite", False, 3),
                ],
            },
            {
                "name": "Intégrité",
                "question": "Comment la banque garantit-elle les liens corrects entre les données associées ?",
                "description": "Exemple : client, compte, crédit, garantie, transaction.",
                "level_responses": [
                    {"label": "Les liens entre les données sont souvent incomplets ou incorrects.", "score": 1},
                    {"label": "Les erreurs sont corrigées manuellement après leur détection.", "score": 2},
                    {"label": "Des règles contrôlent les principaux liens entre les données.", "score": 3},
                    {"label": "Les erreurs de liaison sont détectées automatiquement et suivies.", "score": 4},
                    {"label": "Les contrôles empêchent les erreurs de liaison dès leur création.", "score": 5},
                ],
                "recommendations": [
                    (2, "Corriger les liaisons erronées",
                     "Corriger, après détection, les liens incorrects entre données associées (client, compte, crédit, garantie, transaction).", "qualite", False, 1),
                    (3, "Définir des règles d'intégrité référentielle",
                     "Formaliser des règles contrôlant les principaux liens entre les données.", "qualite", False, 2),
                    (4, "Automatiser le contrôle des liens",
                     "Détecter automatiquement les erreurs de liaison entre données et les suivre.", "qualite", False, 2),
                    (5, "Garantir l'intégrité dès la création",
                     "Mettre en place des contrôles empêchant les erreurs de liaison dès la création des données.", "qualite", False, 3),
                ],
            },
            {
                "name": "Fraîcheur",
                "question": "Les données sont-elles mises à jour dans les délais nécessaires aux opérations et aux reportings ?",
                "level_responses": [
                    {"label": "Les données sont souvent anciennes ou disponibles en retard.", "score": 1},
                    {"label": "Les mises à jour dépendent principalement de traitements manuels.", "score": 2},
                    {"label": "Des délais de mise à jour sont définis pour les données critiques.", "score": 3},
                    {"label": "Les délais sont suivis et les retards génèrent des alertes.", "score": 4},
                    {"label": "La fréquence de mise à jour est adaptée aux besoins et à la criticité des données.", "score": 5},
                ],
                "recommendations": [
                    (2, "Réduire la dépendance aux traitements manuels",
                     "Diminuer la part de mises à jour manuelles pour limiter les retards de disponibilité des données.", "qualite", False, 1),
                    (3, "Définir des délais de mise à jour",
                     "Fixer des délais de mise à jour (fréquence) pour les données critiques selon les besoins.", "qualite", False, 2),
                    (4, "Suivre les délais et alerter sur les retards",
                     "Suivre le respect des délais de mise à jour et générer des alertes en cas de retard.", "qualite", False, 2),
                    (5, "Adapter la fraîcheur à la criticité",
                     "Ajuster la fréquence de mise à jour aux besoins opérationnels et à la criticité des données.", "qualite", False, 2),
                ],
            },
            {
                "name": "Traçabilité",
                "question": "La banque peut-elle retracer l'origine d'une donnée et ses transformations jusqu'à son utilisation finale ?",
                "level_responses": [
                    {"label": "L'origine et le parcours des données sont difficiles à identifier.", "score": 1},
                    {"label": "La traçabilité dépend principalement de la connaissance des équipes.", "score": 2},
                    {"label": "Les sources et les principales transformations sont documentées.", "score": 3},
                    {"label": "Les données sont traçables de leur source jusqu'aux reportings et usages finaux.", "score": 4},
                    {"label": "La traçabilité est automatisée, complète et régulièrement contrôlée.", "score": 5},
                ],
                "recommendations": [
                    (2, "Capitaliser la connaissance sur les flux",
                     "Documenter la connaissance des équipes sur l'origine et le parcours des données critiques.", "qualite", True, 2),
                    (3, "Documenter sources et transformations",
                     "Documenter les sources et les principales transformations des données (dictionnaire des flux).", "qualite", True, 2),
                    (4, "Assurer une piste d'audit de bout en bout",
                     "Rendre les données traçables de la source jusqu'aux reportings et usages finaux (piste d'audit).", "qualite", True, 2),
                    (5, "Automatiser le lignage des données",
                     "Automatiser le lignage des données (data lineage), le rendre complet et le contrôler régulièrement.", "qualite", True, 3),
                ],
            },
            {
                "name": "Gestion des anomalies",
                "question": "Comment les problèmes de qualité des données sont-ils détectés et corrigés ?",
                "level_responses": [
                    {"label": "Les problèmes sont traités uniquement lorsqu'ils bloquent une activité.", "score": 1},
                    {"label": "Ils sont corrigés localement, sans suivi commun.", "score": 2},
                    {"label": "Les anomalies sont enregistrées, attribuées à un responsable et suivies.", "score": 3},
                    {"label": "Des indicateurs mesurent les anomalies, les délais de correction et leur impact.", "score": 4},
                    {"label": "Les causes des problèmes sont corrigées à la source afin d'éviter leur répétition.", "score": 5},
                ],
                "recommendations": [
                    (2, "Suivre les anomalies au-delà de l'urgence",
                     "Traiter les problèmes de qualité au-delà des seuls cas bloquants et en conserver une trace.", "qualite", False, 1),
                    (3, "Centraliser le suivi des anomalies",
                     "Enregistrer les anomalies, les attribuer à un responsable et en assurer le suivi.", "qualite", False, 2),
                    (4, "Mesurer les anomalies par des indicateurs",
                     "Mettre en place des indicateurs sur les anomalies, les délais de correction et leur impact.", "qualite", False, 2),
                    (5, "Corriger les causes à la source",
                     "Traiter les causes racines des problèmes de qualité afin d'éviter leur répétition.", "qualite", False, 3),
                ],
            },
        ],
    },
    {
        "key": "architecture",
        "code": "D4",
        "name": "Architecture & Accès aux données",
        "short_name": "Architecture",
        "description": "Centralisation, interfaces, automatisation, sécurité et continuité des plateformes data.",
        "weight": 20,
        "color": "#7B2D8B",
        "topics": [
            {
                "name": "Centralisation et stockage",
                "question": "Comment les principales données de la banque sont-elles organisées et centralisées ?",
                "level_responses": [
                    {"label": "Les données sont dispersées dans plusieurs fichiers et systèmes isolés.", "score": 1},
                    {"label": "Certaines données sont regroupées localement par direction.", "score": 2},
                    {"label": "Une plateforme commune centralise les principales données.", "score": 3},
                    {"label": "Des référentiels partagés garantissent une version commune des données.", "score": 4},
                    {"label": "L'architecture est intégrée, évolutive et adaptée aux nouveaux besoins.", "score": 5},
                ],
                "recommendations": [
                    (2, "Regrouper les données par direction",
                     "Regrouper localement les données au sein de chaque direction pour réduire leur dispersion.", "architecture", False, 2),
                    (3, "Mettre en place une plateforme de données commune",
                     "Centraliser les principales données dans une plateforme commune (entrepôt de données / datawarehouse).", "architecture", False, 2),
                    (4, "Instaurer des référentiels partagés",
                     "Déployer des référentiels partagés garantissant une version unique et commune des données.", "architecture", False, 3),
                    (5, "Faire évoluer l'architecture de données",
                     "Faire évoluer l'architecture (datawarehouse / datalake) pour la rendre intégrée, évolutive et adaptée aux nouveaux besoins.", "architecture", False, 3),
                ],
            },
            {
                "name": "Échanges entre systèmes",
                "question": "Comment les systèmes de la banque échangent-ils les données ?",
                "level_responses": [
                    {"label": "Les échanges sont principalement manuels.", "score": 1},
                    {"label": "Des échanges spécifiques sont développés au cas par cas.", "score": 2},
                    {"label": "Des interfaces communes relient les principaux systèmes.", "score": 3},
                    {"label": "Les échanges sont standardisés, sécurisés et suivis.", "score": 4},
                    {"label": "Les systèmes échangent les données de manière fluide et facilement adaptable.", "score": 5},
                ],
                "recommendations": [
                    (2, "Fiabiliser les échanges au cas par cas",
                     "Développer des échanges spécifiques entre systèmes pour réduire les transferts manuels.", "architecture", False, 2),
                    (3, "Standardiser les interfaces entre systèmes",
                     "Mettre en place des interfaces communes (API) reliant les principaux systèmes.", "architecture", False, 2),
                    (4, "Sécuriser et superviser les échanges",
                     "Standardiser, sécuriser et suivre les échanges de données entre systèmes.", "architecture", False, 2),
                    (5, "Rendre les échanges fluides et évolutifs",
                     "Assurer des échanges de données fluides et facilement adaptables entre les systèmes.", "architecture", False, 3),
                ],
            },
            {
                "name": "Traitements et pipelines",
                "question": "Quel est le niveau d'automatisation des flux et traitements de données ?",
                "level_responses": [
                    {"label": "Les traitements sont principalement manuels.", "score": 1},
                    {"label": "Certains traitements sont automatisés, mais restent fragiles.", "score": 2},
                    {"label": "Les traitements principaux sont automatisés et documentés.", "score": 3},
                    {"label": "Les traitements sont surveillés et les erreurs sont détectées automatiquement.", "score": 4},
                    {"label": "Les traitements sont industrialisés, fiables et facilement adaptables.", "score": 5},
                ],
                "recommendations": [
                    (2, "Automatiser les traitements clés",
                     "Automatiser une partie des traitements de données aujourd'hui manuels, même de façon perfectible.", "architecture", False, 2),
                    (3, "Documenter et fiabiliser les pipelines",
                     "Automatiser et documenter les principaux traitements et flux de données (pipelines).", "architecture", False, 2),
                    (4, "Superviser les traitements de données",
                     "Surveiller les traitements et détecter automatiquement les erreurs d'exécution.", "architecture", False, 2),
                    (5, "Industrialiser les pipelines de données",
                     "Industrialiser les traitements pour les rendre fiables, réutilisables et facilement adaptables.", "architecture", False, 3),
                ],
            },
            {
                "name": "Sécurité et accès",
                "question": "Comment l'accès aux données sensibles est-il contrôlé ?",
                "level_responses": [
                    {"label": "Les accès sont peu contrôlés ou mal documentés.", "score": 1},
                    {"label": "Les droits sont accordés manuellement sans revue régulière.", "score": 2},
                    {"label": "Les accès sont attribués selon les rôles et les responsabilités.", "score": 3},
                    {"label": "Les droits sont régulièrement revus et les accès sont tracés.", "score": 4},
                    {"label": "Les accès anormaux sont détectés rapidement et les contrôles sont automatisés.", "score": 5},
                ],
                "recommendations": [
                    (2, "Documenter et encadrer les accès",
                     "Documenter les accès aux données sensibles et les accorder de façon plus maîtrisée.", "securite", True, 1),
                    (3, "Gérer les accès par les habilitations",
                     "Attribuer les accès selon les rôles et les responsabilités (matrice des habilitations).", "securite", True, 2),
                    (4, "Revoir périodiquement et tracer les accès",
                     "Réviser régulièrement les droits d'accès et tracer les accès aux données sensibles.", "securite", True, 2),
                    (5, "Détecter les accès anormaux et chiffrer",
                     "Détecter en temps réel les accès anormaux, automatiser les contrôles et chiffrer les données sensibles.", "securite", True, 3),
                ],
            },
            {
                "name": "Sauvegarde et restauration",
                "question": "La banque peut-elle restaurer ses données après un incident ?",
                "level_responses": [
                    {"label": "Les sauvegardes sont absentes ou non maîtrisées.", "score": 1},
                    {"label": "Des sauvegardes existent, mais elles sont peu testées.", "score": 2},
                    {"label": "Les principales données sont sauvegardées selon des règles définies.", "score": 3},
                    {"label": "Les restaurations sont testées régulièrement et les incidents sont suivis.", "score": 4},
                    {"label": "Les mécanismes de reprise sont automatisés, testés et adaptés aux besoins critiques.", "score": 5},
                ],
                "recommendations": [
                    (2, "Fiabiliser les sauvegardes existantes",
                     "Mettre en place des sauvegardes maîtrisées des données, même sans tests réguliers.", "architecture", True, 1),
                    (3, "Définir des règles de sauvegarde",
                     "Sauvegarder les principales données selon des règles définies (fréquence, périmètre).", "architecture", True, 2),
                    (4, "Tester les restaurations (PRA)",
                     "Tester régulièrement les restaurations et suivre les incidents dans le cadre du plan de reprise d'activité (PRA).", "architecture", True, 2),
                    (5, "Automatiser la reprise (PCA/PRA)",
                     "Automatiser et tester les mécanismes de reprise, alignés sur le plan de continuité et de reprise d'activité (PCA/PRA) et les besoins critiques (RTO/RPO).", "architecture", True, 3),
                ],
            },
            {
                "name": "Données chez les prestataires",
                "question": "Comment les données confiées à des prestataires ou solutions externes sont-elles contrôlées ?",
                "level_responses": [
                    {"label": "Les données externes ne sont pas clairement suivies.", "score": 1},
                    {"label": "Certains contrôles existent selon les contrats ou les projets.", "score": 2},
                    {"label": "Les données confiées à des prestataires sont identifiées et encadrées.", "score": 3},
                    {"label": "Des contrôles vérifient la sécurité, l'accès et l'usage de ces données.", "score": 4},
                    {"label": "Les risques liés aux prestataires sont suivis en continu et intégrés à la gouvernance data.", "score": 5},
                ],
                "recommendations": [
                    (2, "Recenser les données externalisées",
                     "Identifier les données confiées à des prestataires et à des solutions externes.", "securite", True, 1),
                    (3, "Encadrer les données confiées aux prestataires",
                     "Encadrer contractuellement les données externalisées (clauses de sécurité et de confidentialité).", "securite", True, 2),
                    (4, "Contrôler la sécurité chez les prestataires",
                     "Contrôler la sécurité, les accès et l'usage des données chez les prestataires de services externalisés.", "securite", True, 2),
                    (5, "Piloter le risque d'externalisation en continu",
                     "Suivre en continu les risques liés aux prestataires (externalisation) et les intégrer à la gouvernance data.", "securite", True, 3),
                ],
            },
        ],
    },
    {
        "key": "analytics",
        "code": "D5",
        "name": "Analytics, Outils & Digitalisation",
        "short_name": "Analytics",
        "description": "Reporting, analyse avancée, automatisation des processus et réactivité métier.",
        "weight": 15,
        "color": "#C4550A",
        "topics": [
            {
                "name": "BI et reporting",
                "question": "Comment les tableaux de bord et reportings sont-ils produits dans la banque ?",
                "level_responses": [
                    {"label": "Ils sont produits manuellement avec des données peu fiables.", "score": 1},
                    {"label": "Chaque direction produit ses propres reportings.", "score": 2},
                    {"label": "Des outils communs et des indicateurs partagés sont utilisés.", "score": 3},
                    {"label": "Les reportings sont automatisés, fiables et régulièrement contrôlés.", "score": 4},
                    {"label": "Les utilisateurs disposent d'indicateurs actualisés et adaptés à leurs besoins.", "score": 5},
                ],
                "recommendations": [
                    (2, "Fiabiliser la production des reportings",
                     "Réduire la production manuelle et améliorer la fiabilité des données des reportings.", "analytique", False, 1),
                    (3, "Partager outils et indicateurs communs",
                     "Déployer des outils décisionnels communs et des indicateurs partagés entre les directions.", "analytique", False, 2),
                    (4, "Automatiser et contrôler les tableaux de bord",
                     "Automatiser les reportings et tableaux de bord et en contrôler régulièrement la fiabilité.", "analytique", False, 2),
                    (5, "Offrir des indicateurs en libre-service",
                     "Mettre à disposition des indicateurs actualisés et adaptés aux besoins des utilisateurs (self-service BI).", "analytique", False, 2),
                ],
            },
            {
                "name": "Analytics avancé et IA",
                "question": "Comment la banque utilise-t-elle les modèles d'analyse avancée ou d'intelligence artificielle ?",
                "level_responses": [
                    {"label": "Aucun modèle avancé n'est utilisé.", "score": 1},
                    {"label": "Quelques tests sont réalisés sans utilisation régulière.", "score": 2},
                    {"label": "Des modèles sont utilisés pour certains besoins métier.", "score": 3},
                    {"label": "Les modèles sont validés, suivis et intégrés aux processus de décision.", "score": 4},
                    {"label": "Les modèles sont largement utilisés et régulièrement améliorés selon leurs résultats.", "score": 5},
                ],
                "recommendations": [
                    (2, "Expérimenter des modèles d'analyse avancée",
                     "Réaliser des premiers tests de modèles d'analyse avancée ou d'IA sur des cas ciblés.", "analytique", True, 2),
                    (3, "Déployer des modèles sur des cas métier",
                     "Utiliser des modèles (par exemple de scoring) pour répondre à des besoins métier identifiés.", "analytique", True, 2),
                    (4, "Valider et suivre les modèles (model risk)",
                     "Valider, documenter et surveiller les modèles (dérive, biais) et les intégrer aux processus de décision (gouvernance des modèles).", "analytique", True, 3),
                    (5, "Généraliser et réévaluer les modèles",
                     "Généraliser l'usage des modèles et les réévaluer régulièrement selon leurs résultats et leur explicabilité.", "analytique", True, 3),
                ],
            },
            {
                "name": "Automatisation des processus métiers",
                "question": "Dans quelle mesure les tâches métiers répétitives liées aux données sont-elles automatisées ?",
                "level_responses": [
                    {"label": "La majorité des tâches sont manuelles.", "score": 1},
                    {"label": "Quelques tâches simples sont automatisées localement.", "score": 2},
                    {"label": "Les principaux processus sont automatisés selon des règles définies.", "score": 3},
                    {"label": "Les processus automatisés sont suivis et améliorés régulièrement.", "score": 4},
                    {"label": "L'automatisation couvre les processus clés et s'adapte aux nouveaux besoins.", "score": 5},
                ],
                "recommendations": [
                    (2, "Automatiser quelques tâches simples",
                     "Automatiser localement quelques tâches métiers répétitives liées aux données.", "process", False, 1),
                    (3, "Automatiser les processus principaux",
                     "Automatiser les principaux processus métiers selon des règles définies.", "process", False, 2),
                    (4, "Suivre et améliorer les processus automatisés",
                     "Suivre les processus automatisés et les améliorer régulièrement.", "process", False, 2),
                    (5, "Étendre l'automatisation aux processus clés",
                     "Étendre l'automatisation aux processus clés et l'adapter aux nouveaux besoins.", "process", False, 3),
                ],
            },
            {
                "name": "Analyses et demandes urgentes",
                "question": "La banque peut-elle produire rapidement des analyses fiables en cas de demande urgente ?",
                "level_responses": [
                    {"label": "Les analyses urgentes sont difficiles à produire et peu fiables.", "score": 1},
                    {"label": "Elles sont produites manuellement avec beaucoup d'effort.", "score": 2},
                    {"label": "Des données et modèles de reporting permettent de répondre aux principales demandes.", "score": 3},
                    {"label": "Les analyses urgentes sont produites rapidement avec des contrôles de fiabilité.", "score": 4},
                    {"label": "La banque peut répondre rapidement aux demandes critiques grâce à des données fiables et disponibles.", "score": 5},
                ],
                "recommendations": [
                    (2, "Faciliter la production d'analyses urgentes",
                     "Réduire l'effort manuel nécessaire pour produire les analyses urgentes.", "analytique", False, 1),
                    (3, "Préparer des modèles de reporting réutilisables",
                     "Mettre à disposition des données et des modèles de reporting couvrant les principales demandes.", "analytique", False, 2),
                    (4, "Fiabiliser les analyses urgentes",
                     "Produire rapidement les analyses urgentes avec des contrôles de fiabilité.", "analytique", False, 2),
                    (5, "Répondre aux demandes critiques en temps voulu",
                     "Répondre rapidement aux demandes critiques grâce à des données fiables et disponibles.", "analytique", False, 2),
                ],
            },
        ],
    },
    {
        "key": "competences",
        "code": "D6",
        "name": "Compétences & Culture Data",
        "short_name": "Compétences",
        "description": "Expertise data, adoption des outils, formation et conduite du changement.",
        "weight": 10,
        "color": "#00838F",
        "topics": [
            {
                "name": "Compétences techniques",
                "question": "La banque dispose-t-elle des compétences nécessaires pour gérer et exploiter ses données ?",
                "level_responses": [
                    {"label": "Les compétences nécessaires sont largement absentes.", "score": 1},
                    {"label": "Elles reposent sur quelques personnes ou prestataires.", "score": 2},
                    {"label": "Les principales compétences sont présentes dans des équipes identifiées.", "score": 3},
                    {"label": "Les compétences sont régulièrement évaluées et renforcées.", "score": 4},
                    {"label": "La banque anticipe ses futurs besoins et développe continuellement ses experts.", "score": 5},
                ],
                "recommendations": [
                    (2, "Sécuriser les compétences data clés",
                     "Réduire la dépendance à quelques personnes ou prestataires en identifiant les compétences data essentielles.", "competences", False, 2),
                    (3, "Constituer des équipes data identifiées",
                     "Réunir les principales compétences data (data analysts, data engineers) dans des équipes identifiées.", "competences", False, 2),
                    (4, "Évaluer et renforcer les compétences data",
                     "Évaluer régulièrement les compétences data et les renforcer par la formation et le recrutement.", "competences", False, 2),
                    (5, "Anticiper les besoins en expertise data",
                     "Anticiper les besoins futurs et développer en continu les experts data (data scientists, CDO).", "competences", False, 3),
                ],
            },
            {
                "name": "Compréhension des données",
                "question": "Les collaborateurs comprennent-ils comment utiliser correctement les données dans leur travail ?",
                "level_responses": [
                    {"label": "Les données sont peu comprises ou peu utilisées.", "score": 1},
                    {"label": "La compréhension dépend de l'expérience de chaque collaborateur.", "score": 2},
                    {"label": "Les collaborateurs connaissent les principales données utiles à leur activité.", "score": 3},
                    {"label": "Ils savent interpréter les indicateurs et identifier les problèmes de qualité.", "score": 4},
                    {"label": "L'utilisation responsable des données fait partie des pratiques quotidiennes.", "score": 5},
                ],
                "recommendations": [
                    (2, "Encourager l'usage des données au travail",
                     "Sensibiliser les collaborateurs à l'utilisation des données dans leur activité quotidienne.", "competences", False, 1),
                    (3, "Diffuser la connaissance des données utiles",
                     "Faire connaître aux collaborateurs les principales données utiles à leur métier.", "competences", False, 2),
                    (4, "Développer la lecture des indicateurs",
                     "Permettre aux collaborateurs d'interpréter les indicateurs et d'identifier les problèmes de qualité.", "competences", False, 2),
                    (5, "Ancrer une utilisation responsable des données",
                     "Faire de l'utilisation responsable des données une pratique quotidienne (data culture).", "competences", False, 2),
                ],
            },
            {
                "name": "Formation",
                "question": "Comment les collaborateurs sont-ils formés aux sujets data ?",
                "level_responses": [
                    {"label": "Aucune formation data n'est proposée.", "score": 1},
                    {"label": "Des formations ponctuelles sont organisées selon les besoins.", "score": 2},
                    {"label": "Un programme de formation est défini pour les principaux profils.", "score": 3},
                    {"label": "Les compétences acquises sont évaluées et les formations sont adaptées.", "score": 4},
                    {"label": "La formation data est continue et personnalisée selon les rôles.", "score": 5},
                ],
                "recommendations": [
                    (2, "Organiser des formations data ponctuelles",
                     "Proposer des formations data ponctuelles selon les besoins des équipes.", "competences", False, 1),
                    (3, "Définir un plan de formation data",
                     "Établir un programme de formation data pour les principaux profils.", "competences", False, 2),
                    (4, "Évaluer et adapter les formations",
                     "Évaluer les compétences acquises et adapter les formations en conséquence.", "competences", False, 2),
                    (5, "Personnaliser la formation data par rôle",
                     "Mettre en place une formation data continue et personnalisée selon les rôles.", "competences", False, 2),
                ],
            },
            {
                "name": "Accompagnement du changement",
                "question": "Comment la banque accompagne-t-elle l'adoption des nouvelles pratiques et des nouveaux outils data ?",
                "level_responses": [
                    {"label": "Aucun accompagnement particulier n'est prévu.", "score": 1},
                    {"label": "Les utilisateurs reçoivent seulement une communication ou une formation initiale.", "score": 2},
                    {"label": "Un plan d'accompagnement est défini pour les principaux projets.", "score": 3},
                    {"label": "L'adoption est mesurée et les difficultés font l'objet d'actions correctives.", "score": 4},
                    {"label": "Les retours des utilisateurs servent à améliorer continuellement les outils et pratiques.", "score": 5},
                ],
                "recommendations": [
                    (2, "Communiquer sur les nouveaux outils data",
                     "Accompagner l'arrivée des nouveaux outils data par une communication et une formation initiale.", "competences", False, 1),
                    (3, "Définir un plan de conduite du changement",
                     "Élaborer un plan d'accompagnement du changement pour les principaux projets data.", "competences", False, 2),
                    (4, "Mesurer l'adoption et corriger",
                     "Mesurer l'adoption des nouvelles pratiques et mener des actions correctives face aux difficultés.", "competences", False, 2),
                    (5, "Améliorer les outils via le retour utilisateurs",
                     "Exploiter les retours des utilisateurs pour améliorer en continu les outils et pratiques data.", "competences", False, 2),
                ],
            },
        ],
    },
]

# Default per-question weight (1-10 scale used by the admin UI).
DEFAULT_QUESTION_WEIGHT = 5

MATURITY_LEVELS = [
    {"label": "Initial", "min_score": 0.0, "max_score": 1.9, "color": "#f87171", "description": "Non-conformité BCT probable. Urgence absolue."},
    {"label": "Reproductible", "min_score": 2.0, "max_score": 2.9, "color": "#fb923c", "description": "Plan de transformation requis immédiatement."},
    {"label": "Défini", "min_score": 3.0, "max_score": 3.4, "color": "#fef08a", "description": "Industrialisation à engager."},
    {"label": "Géré", "min_score": 3.5, "max_score": 4.4, "color": "#86efac", "description": "Maturité avancée. Optimisation ciblée."},
    {"label": "Optimisé", "min_score": 4.5, "max_score": 5.0, "color": "#7dd3fc", "description": "Excellence data-driven. Référence BCT."},
]

BANKS = [
    "Banque de Tunisie (BT)",
    "Société Tunisienne de Banque (STB)",
    "Banque Nationale Agricole (BNA)",
    "Banque de l'Habitat (BH)",
    "Amen Bank",
    "Attijari Bank",
    "BIAT",
    "BTE (Banque de Tunisie et des Emirats)",
    "UIB (Union Internationale de Banques)",
    "ATB (Arab Tunisian Bank)",
    "Banque Zitouna",
    "Banque Tuniso-Koweitienne (BTK)",
    "UBCI (Union Bancaire pour le Commerce et l'Industrie)",
    "Banque Tunisienne de Solidarité (BTS)",
    "Wifak Bank",
]

DEPARTMENTS = [
    "Systèmes d'Information",
    "Gestion des Risques",
    "Conformité & Audit",
    "Opérations Bancaires",
    "Finance & Comptabilité",
    "Crédit",
    "Trésorerie",
    "Ressources Humaines",
]

ROLES = [
    "Responsable de Département",
    "Directeur",
    "Directeur Général / Adjoint",
    "Analyste",
    "Chef de Projet",
    "Consultant",
    "Cadre Supérieur",
]


async def _is_empty(session, model) -> bool:
    count = await session.scalar(select(func.count()).select_from(model))
    return count == 0


async def _reset(session) -> None:
    # Order matters: children before parents.
    for model in (Recommendation, Question, SubDimension, Dimension, Bank, Department, Role, MaturityLevel):
        await session.execute(delete(model))
    print("- cleared reference tables")


async def seed(reset: bool = False) -> None:
    async with AsyncSessionLocal() as session:
        if reset:
            await _reset(session)

        if await _is_empty(session, Dimension):
            n_recos = 0
            for d_order, d in enumerate(DIMENSIONS):
                dim = Dimension(
                    key=d["key"],
                    code=d["code"],
                    name=d["name"],
                    short_name=d["short_name"],
                    description=d["description"],
                    weight=d["weight"],
                    color=d["color"],
                    sort_order=d_order,
                )
                session.add(dim)
                await session.flush()  # populate dim.id

                for t_order, topic in enumerate(d["topics"]):
                    sub = SubDimension(
                        dimension_id=dim.id,
                        name=topic["name"],
                        sort_order=t_order,
                    )
                    session.add(sub)
                    await session.flush()  # populate sub.id

                    question = Question(
                        dimension_id=dim.id,
                        sub_dimension_id=sub.id,
                        text=topic["question"],
                        description=topic.get("description"),
                        type=DEFAULT_QUESTION_TYPE,
                        weight=DEFAULT_QUESTION_WEIGHT,
                        sort_order=0,
                        level_responses=topic.get("level_responses"),
                    )
                    session.add(question)
                    await session.flush()  # populate question.id

                    code_prefix = f"{d['code']}Q{t_order + 1}"
                    for trigger_level, title, text, category, reg_flag, effort in topic["recommendations"]:
                        session.add(
                            Recommendation(
                                code=f"{code_prefix}-{trigger_level - 1}",
                                question_id=question.id,
                                trigger_level=trigger_level - 1,
                                target_level=trigger_level,
                                title=title,
                                recommendation_text=text,
                                category=category,
                                regulatory_flag=reg_flag,
                                effort=effort,
                            )
                        )
                        n_recos += 1
            print(f"- inserted {len(DIMENSIONS)} dimensions + sub-dimensions + questions + {n_recos} recommendations")
        else:
            print("- dimensions already present - skipped")

        if await _is_empty(session, MaturityLevel):
            for order, m in enumerate(MATURITY_LEVELS):
                session.add(MaturityLevel(sort_order=order, **m))
            print(f"- inserted {len(MATURITY_LEVELS)} maturity levels")
        else:
            print("- maturity levels already present - skipped")

        for model, names in ((Bank, BANKS), (Department, DEPARTMENTS), (Role, ROLES)):
            if await _is_empty(session, model):
                for order, name in enumerate(names):
                    session.add(model(name=name, sort_order=order))
                print(f"- inserted {len(names)} {model.__tablename__}")
            else:
                print(f"- {model.__tablename__} already present - skipped")

        await session.commit()
    print("[OK] seed complete")


if __name__ == "__main__":
    asyncio.run(seed(reset="--reset" in sys.argv))
