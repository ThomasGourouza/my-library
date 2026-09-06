import type { Roadmap } from "../types";

export const artsEtMusique: Roadmap = {
  slug: "arts-et-musique",
  title: "Regarder et écouter : les arts",
  goal: "Se donner de quoi regarder un tableau et écouter une œuvre autrement qu'en disant si l'on aime.",
  description:
    "Ce parcours réunit les livres de la bibliothèque qui portent sur les arts autres que la littérature. Il commence par les traités anciens qui posent la question de ce qu'est une œuvre réussie, puis suit l'histoire de l'art telle qu'elle s'est constituée en discipline, de Vasari à Gombrich. Une section est consacrée aux textes qui interrogent notre manière de voir plutôt que les objets vus — Benjamin, Malraux, Berger. Vient ensuite le versant des créateurs, qui écrivent pour justifier ce qu'ils font. La dernière partie est un cursus de musique classique, du manuel de référence aux guides d'écoute : elle est faite pour être parcourue avec des enregistrements à portée de main. Aucune connaissance technique n'est supposée au départ.",
  ageLabel: "Dès 15 ans",
  minAge: 15,
  family: "arts",
  entries: [
    {
      author: "Aristote",
      title: "La Poétique",
      note: "Le premier texte qui démonte une œuvre pour en exposer les rouages : intrigue, reconnaissance, effet sur le spectateur. Toute critique d'art occidentale part de cette manière de faire.",
    },
    {
      author: "Horace",
      title: "Art poétique",
      note: "Les conseils d'un praticien à d'autres praticiens, dont la formule sur l'utile et l'agréable. Il installe l'idée que l'art obéit à des règles transmissibles.",
    },
    {
      author: "Georges Bataille",
      title: "Lascaux ou la naissance de l'art",
      note: "Les peintures pariétales prises comme le moment où l'homme cesse de seulement produire pour se mettre à figurer. Le point de départ chronologique et théorique du parcours.",
    },
    {
      author: "Giorgio Vasari",
      title: "Les Vies des meilleurs peintres, sculpteurs et architectes",
      note: "Le livre qui invente à la fois l'histoire de l'art et la figure de l'artiste-génie. Ses jugements ont commandé notre canon pendant quatre siècles, y compris là où ils sont contestables.",
    },
    {
      author: "Ernst Gombrich",
      title: "Histoire de l'art",
      note: "Le récit continu qui reste le meilleur premier livre sur le sujet : chaque œuvre y est expliquée par le problème que son auteur cherchait à résoudre. À lire d'un bout à l'autre avant tout le reste.",
    },
    {
      author: "Ernst Gombrich",
      title: "Art and Illusion",
      note: "Le même auteur en théoricien : représenter n'est pas copier ce qu'on voit mais corriger un schéma appris. La démonstration que le regard lui-même a une histoire.",
    },
    {
      author: "Gérard Denizeau",
      title: "La Mythologie expliquée par la peinture",
      note: "Les sujets mythologiques identifiés tableau par tableau. Un outil pratique : sans lui, une grande partie de la peinture européenne reste illisible dans le détail.",
    },
    {
      author: "Guillaume Picon",
      title: "L'Histoire de France expliquée par la peinture",
      note: "Le même exercice appliqué aux sujets historiques, où l'on voit comment chaque époque a mis en scène son passé national. La peinture y devient une source sur ceux qui la commandent.",
    },
    {
      author: "John Berger",
      title: "Ways of Seeing",
      note: "Le regard analysé comme un fait social : qui a le droit de regarder quoi, et à quelles conditions. La contestation la plus efficace du récit tranquille de Gombrich.",
    },
    {
      author: "Walter Benjamin",
      title: "L'Œuvre d'art à l'époque de sa reproductibilité technique",
      note: "La reproduction supprime l'unicité et déplace l'œuvre du rituel vers la politique. Trente pages qui commandent presque toute la réflexion ultérieure sur l'image.",
    },
    {
      author: "André Malraux",
      title: "Le Musée imaginaire",
      note: "La photographie met côte à côte des œuvres que personne ne pourrait voir ensemble, et crée un musée sans murs. La conséquence pratique de la thèse de Benjamin, formulée par un écrivain.",
    },
    {
      author: "Martin Heidegger",
      title: "Chemins qui ne mènent nulle part",
      note: "On y trouve L'origine de l'œuvre d'art, où l'œuvre est ce qui ouvre un monde plutôt qu'elle ne représente un objet. Le texte le plus difficile du parcours, et le plus radical.",
    },
    {
      author: "Friedrich Nietzsche",
      title: "La Naissance de la tragédie",
      note: "L'art expliqué par la tension entre une force de forme et une force de débordement. Première tentative moderne de fonder l'esthétique sur autre chose que le beau.",
    },
    {
      author: "Denis Diderot",
      title: "Le Neveu de Rameau",
      note: "Un musicien raté parle de génie, de goût et de bassesse dans le même mouvement. Le dialogue où la question de ce que vaut un artiste est posée sans réponse consolante.",
    },
    {
      author: "André Breton",
      title: "Manifeste du surréalisme",
      note: "Le passage du côté des créateurs : un programme qui définit ce qu'il faut faire avant que les œuvres n'existent. L'art moderne s'écrit ici autant qu'il se peint.",
    },
    {
      author: "André Breton",
      title: "Le Surréalisme et la peinture",
      note: "L'application du programme aux peintres, de Picasso à Miró. On y voit un théoricien construire une postérité en choisissant ses contemporains.",
    },
    {
      author: "Michel Butor",
      title: "Les Nymphéas",
      note: "Un romancier décrit longuement les grands panneaux de Monet. Exercice d'attention pure, utile après tant de théorie : il oblige à revenir à ce qu'on voit.",
    },
    {
      author: "Isidore Isou",
      title: "Introduction à une nouvelle poésie et à une nouvelle musique",
      note: "Le manifeste lettriste, qui prétend décomposer poésie et musique jusqu'à leurs éléments. Cas extrême d'une avant-garde qui se donne d'abord une théorie.",
    },
    {
      author: "Paul Valéry",
      title: "Philosophie de la danse",
      note: "La danse traitée comme un art qui ne produit rien et n'imite rien : l'action délivrée de tout but. La transition la plus naturelle vers la musique.",
    },
    {
      author: "Ulrich Michels",
      title: "Guide illustré de la musique",
      note: "Le manuel de référence, où chaque page associe un texte et une planche : formes, instruments, harmonie, périodes. C'est le socle de la section musicale.",
    },
    {
      author: "Paul Griffiths",
      title: "A Concise History of Western Music",
      note: "Le récit continu de mille ans de musique savante, dans un format que l'on peut lire d'une traite. L'équivalent musical du Gombrich lu plus haut.",
    },
    {
      author: "Harold C. Schonberg",
      title: "The Lives of the Great Composers",
      note: "L'histoire racontée à travers des vies plutôt que des formes. Moins rigoureux que Griffiths, plus efficace pour retenir qui vient avant qui et pourquoi.",
    },
    {
      author: "Harold C. Schonberg",
      title: "The Great Pianists",
      note: "Le versant de l'interprétation, trop souvent absent des histoires de la musique : une même œuvre ne sonne pas de la même façon selon les écoles et les époques.",
    },
    {
      author: "Paul Griffiths",
      title: "The Penguin Companion to Classical Music",
      note: "Le dictionnaire à garder ouvert pendant tout le reste : compositeurs, œuvres, termes techniques. Ouvrage de consultation, pas de lecture suivie.",
    },
    {
      author: "Paul Griffiths",
      title: "Modern Music and After",
      note: "Ce qui s'est passé depuis 1945, période où la plupart des auditeurs décrochent. Le meilleur guide pour aborder une musique qui exige qu'on sache ce qu'elle cherche.",
    },
    {
      author: "Matthew Rye",
      title: "1001 Classical Recordings You Must Hear Before You Die",
      note: "Une liste d'enregistrements commentés, à utiliser comme carnet d'écoute plutôt que comme obligation. C'est le livre qui transforme les précédents en pratique.",
    },
    {
      author: "Stéphane Blet",
      title: "Entretiens posthumes",
      note: "Un pianiste fait parler des musiciens du passé dans des entretiens imaginaires. Forme libre, à lire pour ce qu'elle révèle des convictions de son auteur sur son art.",
    },
  ],
};
