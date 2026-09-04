// Validate the word catalogues, one locale at a time.
//
//   node scripts/check-words.mjs            every locale
//   node scripts/check-words.mjs es         just one
//   node scripts/check-words.mjs --strict   short categories fail the run
//
// Songs get validated against the real iTunes API; words have no such
// authority, so this script enforces the rules stated in the header of
// www/shared/words/index.js. Errors fail the run. Warnings are judgement
// calls worth eyeballing but not worth blocking on.
//
// The rule that actually matters for gameplay is DUPLICATE WORDS ACROSS
// CATEGORIES. The played ledger is keyed by category, so the same word
// sitting in two of them can be dealt twice to a room that picked both.
//
// WHY SIZES ARE SOFT OUTSIDE ENGLISH
// English is the reference: its category sizes are deliberate and a mismatch
// is a real error. A new locale is written a category at a time and is short
// by definition until it is finished, so a shortfall there is reported and
// does not fail. --strict promotes those to errors, which is what to run
// before shipping a locale.
//
// CONTENT rules are errors in every locale. A hint that gives the answer
// away is just as broken in Spanish.
//
// The easy hint `h3` (#181) is OPTIONAL everywhere, including English: it
// lands a category at a time, and a category without it yet is unwritten,
// not broken. Where it is present it obeys every rule the other two do. The
// readout carries the coverage so the authoring can be tracked.

import { readFileSync } from 'node:fs';
import { CATALOGUE_LANGS, DEFAULT_LANG, pickHint } from '../www/shared/words/index.js';
// Accent folding, and why the enye is exempt from it, live next door so
// that words.test.mjs can cover them. This script runs on import.
import { norm, tokens, stemsClash, sharedRoot, looksGendered } from './words-lib.mjs';

// Target sizes per locale. English is enforced exactly; elsewhere these are
// targets a locale works towards, since parity is not a goal and a category
// that does not land with its audience is better left short.
const EXPECTED = {
  en: {
    'Food': 100, 'Animals': 100, 'Places': 100, 'Everyday Objects': 100,
    'Movies & TV': 50, 'Football': 50, 'Super Heroes': 50,
  },
  es: {
    'Food': 100, 'Animals': 100, 'Places': 100, 'Everyday Objects': 100,
    'Movies & TV': 50, 'Football': 50, 'Super Heroes': 50,
  },
  pt: {
    'Food': 100, 'Animals': 100, 'Places': 100, 'Everyday Objects': 100,
    'Movies & TV': 50, 'Football': 50, 'Super Heroes': 50,
  },
};

// Hints whose -o/-a ending has been read and judged safe: nouns, invariant
// colours, place names. See looksGendered() in words-lib.mjs for why an
// allowlist rather than a cleverer rule. Locales with no gendered adjectives
// need no entry here; only Spanish is checked.
//
// Entries are matched against FOLDED tokens, so write them the way norm()
// leaves them: accents stripped ('lagrima', not 'lágrima') but the enye kept
// ('caña', not 'cana'). Getting that wrong shows up as a warning that will
// not go away.
//
// Portuguese inflects adjectives the same way, so `pt` has an entry too. It
// starts empty, which is the point: an EMPTY set still opts the locale into
// the check, and a locale with no entry at all is one the check silently
// skips. It fills up as the catalogue is written (#212).
const GENDER_REVIEWED = {
  // Reviewed while writing the Portuguese Food category (#212). Every one
  // below is a noun, and a noun carries its own gender instead of agreeing
  // with the hidden word, so it leaks nothing. The list is this long because
  // Portuguese nouns end in -o and -a far more often than Spanish ones do,
  // and because the hard band was deliberately pushed onto nouns and
  // infinitives: an infinitive never reaches this check at all.
  //
  // The last group is the exception worth reading twice. Those four ARE
  // inflecting adjectives, and they are safe only because each agrees with
  // the noun standing next to it inside a fixed phrase, not with the secret
  // word. `Casca dura` says the casca is hard. It says nothing about Coco.
  pt: new Set([
    // occasions, times of day, meals
    'almoco', 'aniversario', 'casamento', 'cinema', 'dezembro', 'domingo',
    'festa', 'festinha', 'fogueira', 'inverno', 'junho', 'manha', 'merenda',
    'pascoa', 'paciencia', 'pressa', 'recreio', 'roda', 'sabado', 'segunda',
    'sexta', 'sobremesa', 'sono', 'verao',
    // places, and the places food is bought or eaten
    'academia', 'barraquinha', 'boteco', 'calcadao', 'churrasqueira',
    'confeitaria', 'escritorio', 'estrada', 'feira', 'feirinha', 'forno',
    'geladeira', 'lancheira', 'mercadao', 'padaria', 'praia', 'sertao',
    'tabuleiro', 'videira',
    // containers, tools and what food is served on
    'assadeira', 'bandeja', 'bisnaga', 'bomba', 'caixa', 'canudo', 'chapa',
    'colherada', 'concha', 'copo', 'cuia', 'forma', 'forminha', 'frigideira',
    'fritadeira', 'garfo', 'grelha', 'guardanapo', 'lata', 'latinha',
    'carrinho', 'palito', 'panela', 'panelao', 'pilha', 'sacola', 'taca',
    'tampinha',
    'tigela', 'tulipa', 'xicara',
    // ingredients, and the parts of a thing you can point at
    'abelha', 'acafrao', 'alga', 'aveia', 'barra', 'bloco', 'cabinho',
    'cacho', 'calda', 'caldo', 'cana', 'canela', 'caramelo', 'caroco',
    'casca', 'casquinha', 'castanha', 'cha', 'cobertura', 'coentro', 'colmeia',
    'compota', 'confeito', 'cravo', 'espiga', 'farelo', 'farinha', 'fiapo',
    'fibra', 'fruta', 'fuba', 'gelo', 'gema', 'gordura', 'granulado', 'grao',
    'manteiga', 'massa', 'melado', 'miolo', 'molho', 'mostarda', 'oleo',
    'osso', 'palha', 'pimenta', 'polpa', 'queijo', 'recheio', 'salmao',
    'salsicha',
    'suco', 'talo', 'tempero', 'trigo', 'tripa', 'vinho',
    // shape, texture, sound and the shape of a portion
    'bastao', 'bolha', 'bolinha', 'borda', 'brasa', 'coroa', 'curva', 'dobra',
    'entrega', 'espeto', 'espuma', 'estalo', 'estouro', 'fatia', 'fio',
    'fritura', 'fumaca', 'garganta', 'losango', 'mordida', 'peso', 'ponto',
    'punhado', 'pururuca', 'receita', 'retangulo', 'rodela', 'rodizio',
    'triangulo',
    // and one person: the grandmother whose kitchen the thing comes out of
    'vovo',
    // the four that really are adjectives, each agreeing with the noun
    // beside it in a fixed phrase and not with the hidden word:
    // `Casca dura`, `Festa junina`, `Prato feito`, `Prato fundo`
    'dura', 'feito', 'fundo', 'junina', 'prato',
    // Reviewed while writing the Portuguese Animals category (#212). Same
    // reading: nouns, and the two adjectives at the end agree with the noun
    // standing next to them inside the hint.
    // body, coat and the parts you can point at
    'barba', 'barbatana', 'barbicha', 'barriga', 'bico', 'bocarra', 'cabeca',
    'carapaca', 'casco', 'casulo', 'cauda', 'corcova', 'couraca', 'crina',
    'crista', 'esporao', 'ferrao', 'focinho', 'galhada', 'garra', 'juba',
    'la', 'lingua', 'mandibula', 'nadadeira', 'papada', 'perna', 'pescoco',
    'pinca', 'presa', 'rabinho', 'rabo', 'teia', 'tromba', 'ventosa',
    // sound, movement, and the trait an animal is known for
    'alerta', 'altura', 'astucia', 'brilho', 'cancao', 'canto', 'carga',
    'correria', 'corrida', 'elegancia', 'emboscada', 'equilibrio', 'fenda',
    'ferroada', 'grito', 'jato', 'latido', 'lentidao', 'medo', 'memoria',
    'mergulho', 'passo', 'piado', 'picada', 'pulo', 'queimadura', 'rastro',
    'rugido', 'salto', 'solidao', 'susto', 'teimosia', 'travessura', 'uivo',
    'vista', 'zumbido',
    // habitat, and the place a person actually meets the animal
    'aquario', 'areia', 'australia', 'baia', 'barro', 'beiral', 'brejo',
    'buraco', 'campo', 'caverna', 'cercado', 'charco', 'chiqueiro',
    'chocadeira', 'ciclovia', 'cozinha', 'deserto', 'encosta', 'escuridao',
    'esgoto', 'estatua', 'fazenda', 'floresta', 'formigueiro', 'galho',
    'horta', 'lago', 'lagoa', 'lama', 'lodo', 'madeira', 'madrugada', 'mata',
    'mato', 'muro', 'ninho',
    'oceano', 'palmeira', 'pasto', 'pedra', 'penhasco', 'poleiro', 'praca',
    'ramo', 'rio', 'roca', 'savana', 'selva', 'sitio', 'telhado', 'terra',
    'teto', 'toca', 'trilha', 'tronco', 'zoologico',
    // what a person brings, keeps or tells about it
    'alcateia', 'armadilha', 'baba', 'banda', 'bando', 'barco', 'bola',
    'bolsa',
    'caravana', 'carnica', 'carroca', 'ceia', 'cheiro', 'chuva', 'cinco',
    'coleira', 'colo', 'fabula', 'ferradura', 'fila', 'fileira', 'lenda',
    'lua', 'manada', 'oito', 'ouvido', 'passeio', 'pirata', 'piscina',
    'poeira', 'rebanho', 'rosa', 'silencio', 'tecido', 'tinta', 'tosquia',
    'trouxa', 'veneno',
    // two more adjectives that agree with the noun beside them and not with
    // the secret word: `Bico chato`, `Rabo peludo`
    'chato', 'peludo',
  ]),
  es: new Set([
    // seasons, occasions, times
    'verano', 'invierno', 'otoño', 'primavera', 'domingo', 'navidad',
    'fiesta', 'merienda', 'desayuno', 'infancia', 'semana', 'mañana',
    'verbena', 'romeria', 'romería', 'feria', 'boda', 'cumpleaños',
    // places and regions used as hints
    'galicia', 'asturias', 'andalucia', 'andalucía', 'cordoba', 'córdoba',
    'madrid', 'valencia', 'burgos', 'sevilla', 'granada', 'cataluña',
    'castilla', 'mancha', 'rioja', 'huerta', 'campo', 'playa', 'pueblo',
    'terraza', 'mercado', 'colegio', 'recreo', 'estadio', 'cine',
    // ingredients and things, as nouns
    'azafran', 'azafrán', 'pimenton', 'pimentón', 'bellota', 'sangre',
    'plancha', 'brasa', 'salsa', 'cuchara', 'sarten', 'sartén', 'horno',
    'vinagre', 'aceite', 'harina', 'humo', 'vapor', 'hielo', 'fuego',
    'sobras', 'pastor', 'abuela', 'abuelo', 'cascara', 'cáscara', 'hueso',
    'espina', 'semilla', 'corteza', 'molde', 'papel', 'cuchillo',
    // invariant colours and noun-adjectives
    'rosa', 'naranja', 'malva', 'lila', 'crema',
    'lagrima', 'caña', 'mediodia',
    'filosofia',
    'paso',
    'lata', 'isla', 'ocho', 'cosecha', 'sorpresa',
    // nouns from the neutral-Spanish rewrite (#139)
    'remojo', 'proteina', 'proteína', 'tierra', 'globo', 'frasco',
    'viñedo', 'vinedo', 'lupulo', 'lúpulo', 'mostaza', 'palillos',
    'postre', 'envase', 'fermento', 'circulo', 'círculo', 'nuez',
    'cacao', 'estria', 'estría', 'copos', 'taco', 'aleta', 'mazorca',
    'picadura', 'cerdas', 'caldo', 'resfriado', 'almuerzo', 'antojo',
    'carne', 'termino', 'término', 'coctel', 'banco', 'embutido',
    'manojo', 'arbol', 'árbol', 'capital', 'envoltorio',
    'galaxia', 'mafia', 'brujula', 'brújula', 'carrera', 'colombia',
    'casita', 'discipulo', 'discípulo', 'madera', 'gema', 'cilantro',
    'vecindad', 'pandora', 'frenos', 'oficina', 'medellin', 'medellín',
    'cartel', 'uniforme', 'banda', 'milagro', 'novela', 'muñeca',
    'deudas', 'aldea', 'tesoro', 'armadura', 'varita', 'cicatriz',
    'sable', 'motor', 'hobbit', 'torres', 'minions', 'robo', 'garras',
    'adamantium', 'espadas', 'chistes', 'calavera', 'moto', 'traje',
    'ramas', 'androide', 'acrobacia', 'simbionte', 'lengua', 'escamas',
    'aguijon', 'aguijón', 'fondo', 'colores', 'dimension', 'dimensión',
    'ninja', 'pirata', 'puas', 'púas',
    'piedra', 'cono', 'partido', 'establo', 'ventanilla', 'tejido',
    'escenario', 'alquiler', 'sabores', 'escalones', 'columnas',
    'macetas', 'tractor', 'altura', 'ventanas', 'lineas', 'líneas',
    'carriles', 'peaje', 'prensa', 'teclado', 'imanes', 'agujeros',
    'bordes', 'botones', 'canales', 'dedos', 'correas', 'patillas',
    'cristales', 'punta', 'migajas', 'errores', 'membrana', 'alambre',
    'papeles', 'carta', 'polos', 'cuero', 'tarjetas', 'bolsillo',
    'broche', 'lana', 'guantes',
    // Football: the secret words here are people and clubs, so a hint
    // ending -o/-a has no noun gender to leak in the first place.
    'sacrificio', 'asistencia', 'fideo', 'zurda', 'maravilla',
    'bombonera', 'maracana', 'maracaná', 'rojinegro', 'guadalajara',
    'propia', 'sudamerica', 'sudamérica', 'santos', 'caida', 'caída',
    'velocidad', 'baile', 'milan', 'milán', 'zancada', 'volea',
    'rugido', 'mordida', 'uruguay', 'matador', 'enganche', 'mexico',
    'méxico', 'cabeza', 'rizos', 'pibe', 'chile', 'monumental',
    'millonarios', 'rebaño', 'diablos', 'rojos', 'xeneize', 'parada',
    'guante', 'rejilla', 'precalentar', 'minuto', 'area', 'área', 'puerta',
    // texture, part and shape nouns: the gender-safe way to write a
    // PHYSICAL hint in Spanish, where most sensory adjectives inflect
    'grumo', 'lamina', 'pulpa', 'punta', 'curva', 'mordisco',
    'violeta', 'masa', 'mezcla', 'barra', 'vainilla', 'fruta',
    'ventosa', 'trigo', 'crujido', 'hielo',
    // reviewed while writing Animals (#137): body parts, sounds,
    // habitats and movement, all nouns
    'abanico', 'aleta', 'aleteo', 'alga', 'altura', 'arena',
    'arroyo', 'arrullo', 'astucia', 'aullido', 'baba', 'banco',
    'bandada', 'barro', 'basura', 'bola', 'bolsa', 'bostezo',
    'brillo', 'brinco', 'cacareo', 'campanario', 'carga', 'carroña',
    'cetreria', 'charca', 'chillido', 'chorro', 'cinco', 'cola',
    'colmillo', 'coraza', 'cornamenta', 'cresta', 'cuerno', 'cueva',
    'desierto', 'elegancia', 'equilibrio', 'espectaculo', 'espera', 'eucalipto',
    'familia', 'fila', 'filtro', 'fondo', 'fuerza', 'gallinero',
    'garfio', 'gelatina', 'graznido', 'grito', 'hocico', 'jaula',
    'joroba', 'ladrido', 'lago', 'lana', 'lengua', 'lujo',
    'luna', 'madriguera', 'manada', 'mandibula', 'melena', 'montaña',
    'nado', 'nido', 'pantano', 'panza', 'pasto', 'pecho',
    'pico', 'pinza', 'planeo', 'plaza', 'polo', 'presa',
    'presagio', 'puerto', 'rama', 'raya', 'rebaño', 'rio',
    'roca', 'ronroneo', 'rueda', 'rugido', 'ruido', 'sabana',
    'salto', 'sigilo', 'siglo', 'silbido', 'sonrisa', 'sueño',
    'tela', 'torpedo', 'torpeza', 'trampa', 'travesura', 'trineo',
    'trino', 'trompa', 'tubo', 'veneno', 'verruga', 'zambullida',
    'zancada',
    // reviewed while writing the Spanish Food category (#137): every one
    // of these is a noun, a place name or an invariant colour
    'abeja', 'agujero', 'ajillo', 'aliento', 'almendra', 'anillo',
    'anzuelo', 'aperitivo', 'batidora', 'botella', 'breva', 'cacao',
    'canela', 'cena', 'chufa', 'cogollo', 'compota', 'concha',
    'conejo', 'copa', 'corona', 'cuaresma', 'cucurucho', 'cuello',
    'ensalada', 'envoltorio', 'esponja', 'espuma', 'figura', 'freidora',
    'gajo', 'galleta', 'gallina', 'gaseosa', 'grano', 'grifo',
    'huerto', 'italia', 'jarra', 'loncha', 'mallorca', 'mexico',
    'migaja', 'mono', 'mueca', 'navarra', 'pajita', 'pareja',
    'parrilla', 'pata', 'pelusa', 'puchero', 'rabito', 'racimo',
    'rejilla', 'rodaja', 'sombrero', 'tabla', 'tableta', 'tallo',
    'taza', 'tinta', 'toledo', 'tostada', 'turista', 'vaca',
    'vaina', 'vampiro', 'vaso', 'vela', 'vello', 'viento',
    'vista', 'vitamina', 'zarza', 'zelanda',
    // reviewed while writing Places and Everyday Objects (#137):
    // materials, parts, shapes and sensations, all nouns
    'acecho', 'acerico', 'acero', 'adhesivo', 'adobo', 'adorno',
    'ala', 'anchura', 'archivo', 'arco', 'aro', 'asa',
    'asfalto', 'atasco', 'aula', 'aurora', 'bandeja', 'bandera',
    'baranda', 'barandilla', 'bata', 'berrea', 'blancura', 'blandura',
    'boato', 'bochorno', 'bocina', 'bolsillo', 'bombilla', 'bramido',
    'broca', 'buceo', 'burbuja', 'butaca', 'cabeza', 'caida',
    'calderilla', 'calma', 'camilla', 'campana', 'caravana', 'carpa',
    'carro', 'carta', 'centrifugado', 'cerradura', 'cerro', 'charco',
    'chasquido', 'cima', 'circulo', 'claustro', 'cloro', 'columpio',
    'compra', 'condena', 'costa', 'cria', 'cuatro', 'cuero',
    'cultivo', 'dedo', 'denuncia', 'descanso', 'destello', 'duna',
    'eco', 'encia', 'encierro', 'enredo', 'entrada', 'espalda',
    'espejismo', 'esquina', 'estalactita', 'estruendo', 'etiqueta', 'fibra',
    'filo', 'fogata', 'forro', 'foso', 'garabato', 'giro',
    'grada', 'grapa', 'grieta', 'grua', 'guiso', 'hebilla',
    'hierba', 'hierro', 'hoja', 'hueco', 'incienso', 'jauria',
    'ladera', 'largura', 'lava', 'letargo', 'maceta', 'madrugada',
    'manga', 'mango', 'manguera', 'manteca', 'manzano', 'marea',
    'membrana', 'mina', 'mudanza', 'muralla', 'muñeca', 'naufrago',
    'negrura', 'niebla', 'nuca', 'nudo', 'olvido', 'orbita',
    'oreja', 'orilla', 'oxido', 'oxigeno', 'palmera', 'panorama',
    'pantalla', 'pastilla', 'pelo', 'penumbra', 'percha', 'pernera',
    'peso', 'pinchazo', 'pista', 'pitido', 'pleno', 'pluma',
    'polvo', 'poso', 'precio', 'prensa', 'prisa', 'punteria',
    'ranura', 'realeza', 'rebanada', 'reflejo', 'regateo', 'regazo',
    'reposo', 'reserva', 'respaldo', 'resultado', 'retraso', 'riego',
    'rizo', 'robo', 'rollo', 'rosca', 'ruleta', 'salida',
    'saltito', 'seda', 'siesta', 'silencio', 'solapa', 'sombra',
    'sombrilla', 'sopa', 'subida', 'suela', 'suelo', 'susurro',
    'tablero', 'talla', 'tapa', 'techo', 'teclado', 'tienda',
    'transparencia', 'trazo', 'tulipa', 'vaho', 'vajilla', 'vecino',
    'vertigo', 'visera', 'vitrina', 'vuelta', 'zumbido',
    // reviewed while writing Movies & TV, Football and Super Heroes
    // (#137): nicknames, kit, stadiums and powers, all nouns
    'acrobacia', 'amazona', 'anoeta', 'armadura', 'arqueologo', 'arriba',
    'atraco', 'aventura', 'azulgrana', 'baloncesto', 'banda', 'banquillo',
    'bilbao', 'cabezazo', 'calavera', 'cantera', 'capa', 'carcajada',
    'careta', 'cartulina', 'casco', 'ceguera', 'cerebro', 'cienaga',
    'codigo', 'coleta', 'cordura', 'criptonita', 'delantero', 'descaro',
    'engaño', 'entrega', 'equipo', 'escotilla', 'escudo', 'estirada',
    'europa', 'falta', 'fortuna', 'fosforo', 'furgoneta', 'furia',
    'garra', 'gato', 'guerra', 'guitarra', 'hada', 'himno',
    'historia', 'holanda', 'impaciencia', 'instituto', 'latigo', 'lazo',
    'linea', 'luto', 'magia', 'mano', 'mascara', 'mazo',
    'mestalla', 'metropolitano', 'miedo', 'misterio', 'moneda', 'monoculo',
    'moto', 'musculo', 'niño', 'nostalgia', 'oceano', 'oficina',
    'oido', 'optimismo', 'orejona', 'palabra', 'parada', 'pausa',
    'perilla', 'pizarra', 'polemica', 'prehistoria', 'premio', 'prima',
    'pulga', 'punto', 'puño', 'quimica', 'rayo', 'relampago',
    'rellano', 'risa', 'roma', 'rosario', 'saco', 'sarcasmo',
    'sortija', 'sutileza', 'talento', 'telaraña', 'treinta', 'trueno',
    'tuilla', 'ventana', 'vuelo',
    // reviewed while writing the Spanish EASY hints for Food (#185).
    // The easy band is concrete association, so it lands on nouns even more
    // than the hard band does, and a noun carries its own gender rather than
    // agreeing with the hidden word. `dentro` and `encima` are adverbs and
    // never inflect at all; they only reach this check because of how they
    // end.
    // `asado` is here as the noun it also is across Latin America, the
    // barbecue itself, not as the participle it looks like in `Cerdo asado`.
    'asado', 'batido', 'bocado', 'caramelo', 'cazuela', 'cerdo', 'chorrito',
    'cubitos', 'cuenco', 'cucharada', 'dentro', 'docena', 'encima',
    'encurtido', 'frutero', 'glaseado', 'licuado', 'lluvia', 'mantequilla',
    'marisqueria', 'marisquería', 'menta', 'olla', 'palillo', 'palito',
    'pelicula', 'película', 'pescaderia', 'pescadería', 'piñata', 'regalo',
    'sofrito', 'tarro', 'tripa', 'vasito',
    // reviewed while writing the Spanish easy hints for Animals (#185).
    // Habitats, keepers and the places a person actually meets the animal.
    // `bajo` is the preposition, `abajo` the adverb: neither inflects.
    'abajo', 'africa', 'áfrica', 'aplauso', 'artico', 'ártico', 'australia',
    'bajo', 'boca', 'cementerio', 'cencerro', 'colonia', 'cometa', 'cuento',
    'despensa', 'estatua', 'fabula', 'fábula', 'fango', 'granero', 'huevo',
    'laguna', 'llanura', 'mascota', 'pajaro', 'pájaro', 'paseo', 'perla',
    'picotazo', 'piscina', 'sabiduria', 'sabiduría', 'sendero', 'simetria',
    'simetría', 'tejado', 'terrario', 'tronco', 'tropico', 'trópico',
    'veleta', 'zoologico', 'zoológico',
    // reviewed while writing the Spanish easy hints for Places (#185).
    // What a person does or carries there, which is why so many of them are
    // objects. `no` is the adverb, from `No tocar`.
    'aroma', 'apuesta', 'astronauta', 'balsa', 'cansancio', 'ceniza',
    'cucharita', 'cuenta', 'deshielo', 'ducha', 'enero', 'enfermera',
    'flecha', 'leña', 'lista', 'naufragio', 'no', 'ofrenda', 'payaso',
    'pelota', 'prestamo', 'préstamo', 'propina', 'sabado', 'sábado',
    'sherpa', 'sirena', 'sonda', 'tarea', 'tiza', 'tumba',
    // reviewed while writing the Spanish easy hints for Everyday Objects
    // (#185). Materials, the room the thing lives in, and the errand it gets
    // used for. `frio` is the noun, the cold itself, not the adjective.
    'bienvenida', 'bruja', 'cama', 'camarero', 'corcho', 'correo', 'costura',
    'dentista', 'dobladillo', 'estampado', 'fantasma', 'ferreteria',
    'ferretería', 'frio', 'frío', 'goma', 'metro', 'obra', 'oro', 'ovillo',
    'plastico', 'plástico', 'portada', 'relleno', 'sala', 'tintineo',
    'trabajo',
    // reviewed while writing the Spanish easy hints for Movies & TV,
    // Football and Super Heroes (#185). The secret words here are titles,
    // people and clubs, so a hint ending -o/-a has no noun gender to agree
    // with in the first place; these are all nouns even so. `nueva` is half
    // of the place name `Nueva York`.
    'abogado', 'alegria', 'alegría', 'arbitro', 'árbitro', 'argentina',
    'atlantida', 'atlántida', 'barco', 'cabellera', 'calabaza', 'capucha',
    'cientifico', 'científico', 'clima', 'drama', 'duelo', 'empresa',
    'escandalo', 'escándalo', 'esfuerzo', 'españa', 'francia', 'golazo',
    'hechizo', 'hermano', 'hinchada', 'idolo', 'ídolo', 'imperio',
    'inglaterra', 'infierno', 'inteligencia', 'leyenda', 'locura',
    'maquina', 'máquina', 'mecanica', 'mecánica', 'millonario', 'nueva',
    'paciencia', 'pasado', 'pesadilla', 'piloto', 'porteria', 'portería',
    'princesa', 'promesa', 'puro', 'sofa', 'sofá', 'satira', 'sátira',
    'superclasico', 'superclásico', 'telenovela', 'telepatia', 'telepatía',
    'torneo', 'trapecio', 'trilogia', 'trilogía', 'universo', 'verguenza',
    'vergüenza', 'veterano', 'videojuego', 'villano',
    // reviewed while replacing the hints that named their own answer (#189).
    // Nouns again, and in Football and Super Heroes the secret word is a
    // person or a club, so there is no noun gender for them to agree with.
    // `argentino` and `española` agree with the `club` and `liga` they sit
    // beside, not with the hidden word.
    'amenaza', 'argentino', 'clasico', 'clásico', 'enemigo', 'española',
    'espanola', 'extremo', 'liga', 'planeta', 'trofeo',
  ]),
};

// Longest word the draw and word cards can show without wrapping badly.
const MAX_WORD_LEN = 26;
const MAX_HINT_WORDS = 2;

// Categories Impostor Draw offers. Reported, not enforced.
const DRAWABLE = ['Food', 'Animals', 'Everyday Objects', 'Super Heroes'];

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.filter(a => !a.startsWith('--'));
const langs = only.length ? only : CATALOGUE_LANGS;

for (const l of only) {
  if (!CATALOGUE_LANGS.includes(l)) {
    console.error(`No catalogue for "${l}". Have: ${CATALOGUE_LANGS.join(', ')}`);
    process.exit(2);
  }
}

// The display names for a locale, so "a hint is never the category name" can
// check the name players actually see and not only the English id. Absent
// before a locale has a string table, which is fine.
function displayNames(lang) {
  const out = [];
  try {
    const json = JSON.parse(readFileSync(new URL(`../src/content/${lang}/word.json`, import.meta.url), 'utf8'));
    for (const [k, v] of Object.entries(json.runtime || {})) {
      if (k.startsWith('category.') && k.endsWith('.name') && typeof v === 'string') out.push(v);
    }
  } catch (e) { /* no table for this locale yet */ }
  return out;
}

// ------------------------------------------------------------
let failed = false;
const idSets = {};

for (const lang of langs) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  const { WORD_CATEGORIES } = await import(`../www/shared/words/${lang}.js`);
  const expected = EXPECTED[lang];
  const reference = lang === DEFAULT_LANG;

  const cats = Object.keys(WORD_CATEGORIES);
  idSets[lang] = cats;

  // Both the ids and the translated names: a Spanish hint of "Comida" in the
  // Food category is exactly as useless as an English one of "Food".
  const forbidden = new Set([...cats, ...displayNames(lang)].map(norm));

  const seenWords = new Map(); // normalised word -> "Category / Word"
  const easyByCat = {}; // category -> how many entries carry an easy hint
  let total = 0;
  let easyTotal = 0;
  let hintTotal = 0;

  if (!expected) warn('no expected-size table for this locale');

  for (const cat of cats) {
    const list = WORD_CATEGORIES[cat];
    const where = (w) => `${cat} / ${w}`;

    if (!Array.isArray(list)) { err(`${cat}: not a list`); continue; }
    total += list.length;

    // A category with nothing in it is one nobody has written yet, not a
    // broken one. pickWord() drops ids with no words, so the game is fine
    // while a locale is being filled in.
    //
    // Under --strict it IS a failure, because --strict asks a different
    // question: not "is this catalogue sane" but "is this locale ready to
    // ship". An empty category is the loudest possible no. Without this the
    // ship gate passed an entirely empty catalogue, since the size check
    // below is never reached.
    if (!list.length) {
      if (reference || strict) err(`${cat}: empty`);
      else notes.push(`${cat}: not written yet`);
      continue;
    }

    if (expected && expected[cat] === undefined) warn(`${cat}: not in the expected-size table`);
    else if (expected && list.length !== expected[cat]) {
      const msg = `${cat}: ${list.length} entries, target ${expected[cat]}`;
      if (reference || strict) err(msg);
      else warn(msg);
    }

    const inCat = new Set();
    let easy = 0;

    for (const e of list) {
      if (!e || typeof e.w !== 'string' || !e.w.trim()) { err(`${cat}: entry with no word`); continue; }
      const w = e.w.trim();

      for (const field of ['h', 'h2']) {
        if (typeof e[field] !== 'string' || !e[field].trim()) err(`${where(w)}: missing ${field}`);
      }
      if (!e.h || !e.h2) continue;
      // Absent is fine, present and empty is a half-finished edit.
      if (e.h3 !== undefined && (typeof e.h3 !== 'string' || !e.h3.trim())) {
        err(`${where(w)}: h3 is present but empty`);
      }

      // Every rule below runs over whichever hints this entry actually has.
      const hintFields = ['h', 'h2', ...(e.h3 && e.h3.trim() ? ['h3'] : [])];
      if (hintFields.length === 3) easy++;

      // All of them distinct. An easy hint repeating one of the hard two
      // costs the entry a third of its variety and tells the impostor
      // nothing they would not have got anyway.
      for (let i = 0; i < hintFields.length; i++) {
        for (let j = i + 1; j < hintFields.length; j++) {
          const a = hintFields[i], b = hintFields[j];
          if (norm(e[a]) === norm(e[b])) err(`${where(w)}: ${a} and ${b} are both "${e[a]}"`);
        }
      }
      if (w.length > MAX_WORD_LEN) warn(`${where(w)}: ${w.length} chars, over the ${MAX_WORD_LEN} the cards fit`);
      // Distinct is the error above; distinct ENOUGH is this warning (#186).
      // An easy hint made of a hard hint's own root, `Global tournament`
      // against `Global`, leaks nothing, since only one hint is ever dealt.
      // It just wastes the round it is dealt on. Judgement call, so it is
      // reported for the author to read rather than blocking the run.
      for (let i = 0; i < hintFields.length; i++) {
        for (let j = i + 1; j < hintFields.length; j++) {
          const a = hintFields[i], b = hintFields[j];
          if (norm(e[a]) === norm(e[b])) continue; // already an error
          const root = sharedRoot(e[a], e[b]);
          if (root) warn(`${where(w)}: ${b} "${e[b]}" shares a root with ${a} "${e[a]}" ("${root[0]}"/"${root[1]}")`);
        }
      }

      // Duplicates inside the category, then across the whole catalogue.
      const key = norm(w);
      if (inCat.has(key)) err(`${where(w)}: duplicated inside its own category`);
      inCat.add(key);
      if (seenWords.has(key)) err(`${where(w)}: also in ${seenWords.get(key)}, and the played ledger is per-category, so this word can be dealt twice`);
      else seenWords.set(key, where(w));

      for (const field of hintFields) {
        const hint = e[field];
        const hTokens = tokens(hint);

        if (hTokens.length > MAX_HINT_WORDS) err(`${where(w)}: ${field} "${hint}" is ${hTokens.length} words, max ${MAX_HINT_WORDS}`);
        if (forbidden.has(norm(hint))) err(`${where(w)}: ${field} "${hint}" is a category name, which the room already knows`);

        // A warning, not an error: the ending is a signal, not proof, and the
        // author is the one who can tell a noun from an adjective.
        //
        // Only for locales whose adjectives inflect. English has no such
        // agreement, so running this there flagged "Two-toned" and "Retro"
        // as leaks, which they cannot be. A locale opts in by having an
        // entry in GENDER_REVIEWED, even an empty one.
        const gendered = GENDER_REVIEWED[lang]
          ? looksGendered(hint, GENDER_REVIEWED[lang])
          : null;
        if (gendered) warn(`${where(w)}: ${field} "${hint}" ends in -${gendered.slice(-1)} ("${gendered}"), so if it is an adjective it leaks the word's gender`);

        // Substring either way, then a stem check per token pair.
        if (norm(hint).includes(key) || key.includes(norm(hint))) {
          err(`${where(w)}: ${field} "${hint}" contains the word (or vice versa)`);
          continue;
        }
        for (const wt of tokens(w)) {
          for (const ht of hTokens) {
            if (stemsClash(wt, ht)) err(`${where(w)}: ${field} "${hint}" shares a stem with "${wt}"`);
          }
        }
      }

      hintTotal += hintFields.length;
    }

    easyByCat[cat] = easy;
    easyTotal += easy;
  }

  // A hint that is itself a secret word elsewhere is survivable (only the
  // selected categories are ever in play) but worth knowing about.
  for (const cat of cats) {
    for (const e of WORD_CATEGORIES[cat]) {
      if (!e || !e.h) continue;
      for (const field of ['h', 'h2', 'h3']) {
        if (!e[field]) continue;
        const other = seenWords.get(norm(e[field] || ''));
        if (other && other !== `${cat} / ${e.w}`) warn(`${cat} / ${e.w}: ${field} "${e[field]}" is also the secret word ${other}`);
      }
    }
  }

  // pickHint has to return one of the two, never undefined.
  for (const cat of cats) {
    for (const e of WORD_CATEGORIES[cat]) {
      for (let i = 0; i < 20; i++) {
        const got = pickHint(e);
        if (got !== e.h && got !== e.h2 && got !== e.h3) { err(`${cat} / ${e.w}: pickHint returned "${got}"`); break; }
      }
    }
  }

  // ----------------------------------------------------------
  console.log(`\n${lang}${reference ? '  (reference)' : ''}`);
  for (const cat of cats) {
    const n = WORD_CATEGORIES[cat].length;
    const target = expected ? expected[cat] : undefined;
    // Fixed width either way, so the easy column below stays in line.
    const short = (target !== undefined && n !== target) ? `  of ${String(target).padStart(3)}` : ' '.repeat(8);
    // Progress, not pass/fail: easy hints land a category at a time (#181).
    const easy = easyByCat[cat] || 0;
    const easyCol = n ? `  easy ${String(easy).padStart(3)}/${String(n).padStart(3)}` : ' '.repeat(15);
    console.log(`  ${cat.padEnd(18)} ${String(n).padStart(3)}${short}${easyCol}${DRAWABLE.includes(cat) ? '  (drawable)' : ''}`);
  }
  const drawTotal = DRAWABLE.reduce((n, c) => n + (WORD_CATEGORIES[c] || []).length, 0);
  console.log(`  ${'word game'.padEnd(18)} ${String(total).padStart(3)}`);
  console.log(`  ${'draw game'.padEnd(18)} ${String(drawTotal).padStart(3)}`);
  console.log(`  ${'hints'.padEnd(18)} ${String(hintTotal).padStart(3)}`);
  console.log(`  ${'easy hints'.padEnd(18)} ${String(easyTotal).padStart(3)} of ${total}`);

  if (notes.length) {
    console.log(`\n  ${notes.length} not written yet`);
    notes.forEach((n) => console.log('    - ' + n));
  }
  if (warnings.length) {
    console.log(`\n  ${warnings.length} warning(s)`);
    warnings.forEach((w) => console.log('    ! ' + w));
  }
  if (errors.length) {
    console.log(`\n  ${errors.length} error(s)`);
    errors.forEach((e) => console.log('    x ' + e));
    failed = true;
  }
}

// ------------------------------------------------------------
// pickHint's own contract, checked once rather than per locale.
{
  const bad = [];
  if (pickHint(null) !== '' || pickHint({ w: 'X' }) !== '') bad.push('pickHint does not fall back to "" for a broken entry');
  if (pickHint({ w: 'X', h: 'Only' }) !== 'Only') bad.push('pickHint does not fall back to h when h2 is missing');
  if (pickHint({ w: 'X', h3: 'Easy' }) !== 'Easy') bad.push('pickHint does not fall back to h3 when it is the only hint');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickHint({ w: 'X', h: 'A', h2: 'B' }));
  if (seen.size !== 2) bad.push(`pickHint returned ${seen.size} distinct hints over 200 draws, expected 2`);
  // The whole of the difficulty weighting: uniform over three hints is the
  // one-in-three easy rate, so an entry that has an easy hint must be able
  // to deal all three (#181).
  const seen3 = new Set();
  for (let i = 0; i < 300; i++) seen3.add(pickHint({ w: 'X', h: 'A', h2: 'B', h3: 'C' }));
  if (seen3.size !== 3) bad.push(`pickHint returned ${seen3.size} distinct hints over 300 draws of a three-hint entry, expected 3`);
  if (bad.length) { console.log('\npickHint'); bad.forEach(b => console.log('    x ' + b)); failed = true; }
}

// Every locale must offer the same category ids. They are the cross-client
// keys in meta.categories, so a locale that renamed or dropped one would
// break room joins rather than just show less.
if (langs.length > 1) {
  const refName = idSets[DEFAULT_LANG] ? DEFAULT_LANG : langs[0];
  const ref = idSets[refName];
  for (const lang of langs) {
    if (lang === refName) continue;
    const missing = ref.filter(id => !idSets[lang].includes(id));
    const extra = idSets[lang].filter(id => !ref.includes(id));
    if (missing.length || extra.length) {
      console.log(`\ncategory ids: ${lang} does not match ${refName}`);
      missing.forEach(id => console.log(`    x missing "${id}"`));
      extra.forEach(id => console.log(`    x has "${id}", which ${refName} does not`));
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('\nAll checks passed.');
