/**
 * The 2048 words an account key is drawn from (4 words, 44 bits).
 * Simple, family-friendly French words written without accents, so a key is
 * easy to read aloud and to type on any keyboard. Derived from the BIP-39
 * French list, with dark or obscure words swapped for everyday ones.
 */
const WORDS = `
abaisser abandon abdiquer abeille abolir aborder aboutir aboyer abrasif abreuver abricot abriter abroger
abrupt absence absolu absurde academie acajou acarien accabler accepter acclamer accolade accroche accuser
achat acheter aciduler acier acompte acquerir acronyme acteur actif actuel adepte adequat adhesif adjectif
adjuger admettre admirer adopter adorer adoucir adresse adroit adulte adverbe aerer affaire affecter affiche
affubler agacer agencer agile agiter agrafer agreable agrume aider aiguille ailier aimable aisance ajouter
ajuster alarmer alchimie alerte algebre algue aliment alleger alliage allouer allumer alourdir alpaga altesse
amande amateur ambigu ambre amenager amertume amidon amiral amorcer amour amovible ampleur amusant analyse
ananas anatomie ancien ancre angle anguleux animal annexer annonce annuel anodin anomalie anonyme anormal
antenne antidote anxieux apaiser aperitif aplanir apologie appareil appeler apporter appuyer aquarium aqueduc
arbitre arbuste ardeur ardoise argent arlequin armature armement armoire armure arpenter arracher arriver
arroser article aspect asphalte aspirer assiette associer assurer asticot astre astuce atelier atome atrium
attaque attentif attirer attraper aubaine auberge audace audible augurer aurore automne autruche avaler
avancer avenir averse aveugle aviateur avide avion avoine avouer avril axial axiome badge bagage bague
baguette baignade balade balancer balcon baleine balisage balle ballet ballon bambin banane bancaire bandage
banjo banlieue banniere banquier barbier baril baron barque barrage bassin bastion bateau batterie baudrier
bavarder belette belier belote benefice berceau berger berline bermuda besace besogne betail beurre biberon
biche bicycle bidule bijou bilan bilingue billard binaire biologie biscuit bison bitume bizarre blafard blague
blanc blanchir bleu blinder blond bloquer blouson bobard bobine boire boiser bolide bonbon bondir bonheur
bonifier bonnet bonus bordure borne botte boucle boueux bougie boulon bouquin bourse boussole boutique bouton
boxeur branche brasier brave brebis breche breuvage bricoler brigade brillant brioche brique brochure broder
bronze bronzer brousse broyeur brume brun brusque brutal bruyant buffle buisson bulletin bureau burin bustier
but butiner butoir buvable buvette cabane cabanon cabine cacao cachette cadeau cadre cafe cafeine cahier
caillou caisson calculer calepin calibre calmer camarade camera camion campagne canal canard caneton canon
cantine canular capable caporal caprice capsule capter capuche caramel carbone caresser caribou carotte
carreau carte carton cascade casier casque cassure castor causer caution cavalier caverne caviar ceinture
celeste cellule cendrier central cercle cerebral cerise cerner cerveau cesser chagrin chaise chalet chaleur
chambre chameau chance chanson chapeau chapitre charbon chasseur chat chaton chausson chavirer chemise
chenille chercher cheval chien chiffre chignon chimere chiot chocolat choisir chose chou chouette chrome chute
ciel cigare cigogne cimenter cinema cintrer circuler cirer cirque citerne citoyen citron civil clairon clameur
claquer classe clavier client cligner climat clivage cloche clonage clown cobra cocasse cochon cocotier coder
codifier coffre cogner cohesion coiffer coincer colere colibri collier colline colmater colonel comedie comete
commande compact concert conduire confier congeler consonne contact conte convexe cookie copain copie coquille
corail corbeau cordage corniche corpus correct cortege cosmique costume coton coude couette couleur coupure
courage courge course coussin couteau couvrir coyote crabe crainte cravate crayon creature crediter cremeux
crepe creuser crevette cribler crier cristal critere croire croquer crucial cruel crypter cubique cueillir
cuillere cuisine cuivre culminer cultiver cumuler curatif curseur cycle cylindre daigner damier danger danse
danseur dauphin debattre debiter deborder debrider debutant decaler decembre dechirer decider declarer decorer
decrire dedale deesse defensif defiler defrayer degager degivrer dejeuner delice deloger demander demeurer
demolir denicher denouer dentelle depart depenser deplacer deposer deranger derober descente desert designer
desobeir dessin dessiner destrier detacher devancer devenir deviner devoir dialogue diamant dicter differer
digerer digital digne diluer dimanche diminuer directif diriger discuter disposer dissiper distance divertir
diviser docile docteur dodo doigt domaine domicile dompter donateur donjon donner dopamine dore dortoir dorure
dosage doseur dossier dotation douanier double douceur douter doyen dragon draper dresser dribbler droiture
dune duplexe durable durcir dynastie eblouir ecarter echarpe echelle eclairer eclipse eclore ecluse ecole
economie ecorce ecouter ecraser ecremer ecrivain ecrou ecume ecureuil edifier eduquer effacer effectif effigie
effort effusion egaliser egarer ejecter elaborer elargir electron elegant elephant eleve eligible elitisme
eloge elucider eluder emballer embellir embryon emeraude emission emmener emotion emouvoir empereur employer
emporter emprise emulsion encadrer enchere enclave encoche endiguer endosser endroit enduire energie enfance
enfermer enfouir engager engin englober enigme enjamber enjeu enlever ennemi ennuyeux enrichir enrobage
enseigne entasser entendre entier entourer entraver enumerer envahir enviable envoyer enzyme eolien epaissir
epargne epatant epaule epicerie epier epilogue epine episode epoque epreuve eprouver epuisant equerre equipe
eriger erosion erreur eruption escalier espadon espece espiegle espoir esprit esquiver essayer essence essieu
essorer estime estomac estrade etagere etaler etanche eteindre eternel ethique etirer etoffer etoile etonnant
etourdir etrange etroit etude euphorie evaluer evasion eventail evidence eviter evolutif evoquer exact
exagerer exaucer exceller excitant exclusif excuse executer exemple exercer exigence exiler exister exotique
expedier explorer exposer exprimer exquis extensif extraire exulter fable fabuleux facette facile facture
faiblir falaise fameux famille farceur farfelu farine farouche fasciner fatigue faucon fautif faveur favori
fee felin femur fendoir feodal fermer feroce ferveur festival feuille feutre fevrier fiasco ficeler fictif
fidele figure fil filature filet filetage filleul filmer filou filtrer financer finir fiole firme fissure
fixer flairer flamme flasque flatteur fleche fleur flexion flocon flore fluctuer fluide flute fluvial folie
fonderie fondue fontaine forcer forgeron formuler fortune fossile foudre fougere fouiller foulure fourmi
fragile fraise franchir frapper fregate freiner frelon fremir frenesie frere friable friction frisson frivole
froid fromage frontal frotter fruit fugitif fuite fureur furieux furtif fusee fusion futur gagner galaxie
galerie galet gambader gant garantir gardien garnir garrigue gateau gaufre gazelle gazon geant gelatine gelule
gendarme general genie genou gentil geologie geometre geranium germe gestuel geyser gibier gicler gilet girafe
givre glace glaive glisser globe gloire glorieux golfeur gomme gonfler gorge gorille goudron gouffre goulot
goupille gourmand goutte graduel graffiti graine grand grappin gratuit gravir grenat griffure griller grimper
gris grogner gronder grotte groupe grutier gruyere guepard guide guimauve guitare gymnaste habitude hachoir
halte hameau hamster hangar hanneton haricot harmonie harpe harpon hasard helium herbe herisson hermine heron
hesiter heureux hiberner hibou hilarant histoire hiver homard hommage homogene honneur honorer horde horizon
horloge hormone houleux housse hublot huileux humain humble humide humour hurler hygiene hymne hypnose idylle
ignorer iguane illusion image imbiber imiter immense immobile immuable impact imperial implorer imposer
imprimer imputer incarner incendie incident incliner incolore indice inedit inexact infini informer infusion
inhaler innocent inonder inscrire insecte insigne insolite inspirer instinct intact intense intime intrigue
intuitif inutile invasion inventer inviter invoquer ironique irreel irriter isoler ivoire jade jaguar jaillir
jambe janvier jardin jasmin jauger jaune javelot jetable jeton jeudi jeunesse joindre joncher jongler jongleur
joueur journal jovial joyau joyeux jubiler jugement junior jupe jupon juriste jus justice juteux juvenile
kayak kimono kiosque kiwi koala label labourer lagune laine laisser laitier lama lambeau lamelle lampe lanceur
langage lanterne lapin largeur larme laurier lavabo lavande lavoir lecture legal leger legume lentille lessive
lettre levier lexique lezard liasse liberer libre licence licorne liege lievre ligature ligue lilas limer
limite limonade limpide lin lineaire lingot lion lionceau liquide lisiere lister lithium litige littoral livre
livreur logique lointain loisir loterie louer loup lourd loutre louve loyal lubie lucide lucratif lueur luge
luisant lumiere lunaire lundi lune lunettes luron lutin lutter luxueux machine magasin magenta magie magique
maigre maillon maintien mairie maison malaxer malice mallette mammouth mandater mangue maniable manquant
manteau manuel marathon marbre marchand marche mardi maritime marmotte marqueur marron marteler mascotte
massif match materiel matiere matin maussade mauve maximal meconnu medaille medecin mediter meduse meilleur
melange melodie melon membre memoire menacer mener menhir mentor mercredi merite merle messager mesure metal
meteore methode metier meuble miauler microbe miel miette mignon migrer milieu million mimique mince mineral
minimal minuit minute miracle miroiter mitaine mixte mobile moderne moelleux moineau mondial moniteur monnaie
monotone monstre montagne montre monument moqueur morceau mortier moteur motif mouche mouette moufle moulin
mousson mouton mouvant muffin muguet multiple muraille murene murmure muscle museum musicien mutation muter
mutuel myriade myrtille mystere mythique nacre nageur nappe narquois narrer natation nation nature nautique
navet navire nebuleux nectar negation negliger negocier neige nerveux nettoyer neurone neutron neveu niche
nickel niveau noble nocturne noir noirceur noisette noix nomade nombreux nommer notable notifier nougat
nourrir nouveau novateur novembre novice nuage nuancer nuire nuisible numero nuptial nuque nutritif obeir
objectif obliger obscur observer obstacle obtenir occasion occuper ocean octobre oculaire odeur odorant
offenser officier offrir ogive oiseau oisillon olive olivier ombrage omettre onctueux onduler onereux opale
opaque operer opinion opportun opter optique orageux orange orbite ordonner oreille organe orgueil orifice
ornement orque ortie osciller ossature otarie ouragan ours ourson outil outrager ouvrage ovation oxyde oxygene
ozone paisible palace palette palmares palmier palourde palper panache pancake panda pangolin panier paniquer
panneau panorama pantalon papaye papier papoter papyrus paradoxe parcelle paresse parfumer parler parole
parrain parsemer partager parure parvenir passion pasteque paternel pates patience patron pavillon pavoiser
payer paysage peche peigne peintre peinture pelage pelican pelle pelouse peluche pendule penetrer penible
pensif pepite perdrix perforer periode perle permuter perplexe persil perte peser petale petit petrir peuple
pharaon phare phoque photo photon phrase physique piano pictural piece pierre pieuvre pigeon pilote pinceau
pingouin pipette piquer pirogue piscine piston pivoter pixel pizza placard plafond plage plaisir planer
planete plaque plastron plateau pleurer pliage plomb plonger pluie plumage pochette poeme poesie poete pointe
poire poireau poirier poisson poivre polaire policier pollen polygone pommade pomme pompier ponctuel poney
portique position posseder posture potager poteau potion potiron pouce poulain poule poumon pourpre poussin
pouvoir prairie praline pratique precieux predire prefixe prelude prenom presence pretexte prevoir primitif
prince prison priver probleme proceder prodige profond progres proie projeter prologue promener propre
prospere proteger prouesse proverbe prudence prune pruneau public puceron puiser pull pulpe pulsar punaise
punitif pupitre purifier puzzle pyjama pyramide quasar querelle question quietude quitter quotient racine
raclette raconter radieux radis ragondin raideur raisin ralentir rallonge ramasser rapide raquette rasage
ratisser ravager ravin rayonner reactif reagir realiser reanimer recevoir reciter reclamer recolter recruter
reculer recycler rediger redouter refaire reflexe reformer refrain refuge region reglage regulier rejeter
rejouer relatif relever relief remarque remede remise remonter remplir remuer renard renfort renifler renne
renoncer rentrer renvoi replier reporter reprise reptile requin reserve resineux resoudre respect rester
resultat retablir retenir retomber retracer reunion reussir revanche revivre richesse rideau rieur rigide
rigoler rincer riposter risible risque rituel rival riviere riz robe rocheux roller romance rompre ronce
rondin rose roseau rosier rotatif rotor rotule rouge rouille rouleau routine royaume ruban rubis ruche ruelle
rugueux ruisseau ruser rustique rythme sable sabler sabre sacoche safari sagesse saisir salade salive salon
saluer samedi sanglier saphir sardine saturer saugrenu saumon sauter sauvage savant savonner scenario sceptre
schema science scinder score scrutin sculpter seance secher secouer sedatif seduire seigneur sejour selectif
semaine sembler semence senateur sensible sentence separer sequence serein sergent serieux serre serrure serum
service sesame siecle sieger sieste siffler sigle signal silence silicium simple sincere siphon sirene sirop
sismique situer skate ski skier social socle sodium soie soigneux soir soldat soleil solitude soluble sombre
sommeil somnoler sonde songeur sonnette sonore sorbet sorcier sortir sosie sottise soucieux soudure souffle
soulever soupape soupe source souris soutirer souvenir spacieux spatial special sphere spiral stable station
sternum stimulus stipuler strict studieux stupeur styliste stylo sublime subtil subvenir succes sucette sucre
suffixe suggerer suiveur superbe supplier surface suricate surmener surprise sursaut survie suspect syllabe
symbole symetrie synapse syntaxe systeme tabac tablier tactile tailler talent talisman talonner tambour
tamiser tangible tango tapis taquiner tarder tarif tarte tartine tasse tatami tatouage taupe taureau taxer
temoin temporel tenaille tendre teneur tenir tension tente terminer terne terrible tetine texte theatre theme
theorie therapie thorax tibia tiede tigre timide tirelire tiroir tisane tissu titane titre toboggan tolerant
tomate tonique tonneau torche tordre tornade torrent torse tortue totem toucher tournage tousser traction
trafic tragique train trancher travail trefle tremper tresor treuil triage tribunal tricot tricoter trilogie
triomphe tripler trivial trombone tronc tropical troupeau tuile tulipe tumulte tunnel turbine tuteur tutoyer
tuyau tympan typhon typique ukulele ultime ultrason unanime unifier union unique unitaire univers uranium
urbain usage usine usuel usure utile utopie vacarme vaccin vache vagabond vague vaillant vaincre vaisseau
valable valise vallon valse valve vanille vapeur varier vaseux vassal vaste vecteur vedette vegetal vehicule
veinard velo veloce velours vendredi venerer ventouse verdure verger vernir verrou verser vert vertu veston
veteran vetuste viaduc viande victoire vidange video vignette vigueur vilain village vinaigre violet violon
vipere virement virtuose virus visage viseur vision visqueux visuel vital vitesse vitrine vivace vocation
voguer voile voilier voisin voiture volaille volcan voltiger volume vorace vortex voter vouloir voyage voyelle
wagon xenon yacht yaourt zebre zenith zeste zoologie
`;

export const WORDLIST_FR: readonly string[] = WORDS.trim().split(/\s+/);
