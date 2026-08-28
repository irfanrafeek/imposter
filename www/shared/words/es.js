// ============================================================
// THE SPANISH WORD CATALOGUE
// ============================================================
// Written for players in Spain, not translated from en.js. Parity with the
// English catalogue is explicitly not a goal: a category that does not land
// with a Spanish table is worth less than a shorter one that does.
//
// The KEYS below stay English. They are data keys with history behind them,
// not labels; see the header of index.js. Only the arrays are Spanish.
//
// This file is the shelf. #137 fills it, one category at a time so each can
// be read through before the next is written. Until a category has words,
// scripts/check-words.mjs reports it as not-yet-written rather than failing,
// and loadCatalog() falls back to English while the whole file is empty, so
// a half-finished catalogue can never deal `undefined` as the secret word.
//
// Two Spanish-only traps, neither of which a checker can see:
//
//   - GENDER LEAKS THE ANSWER. `Roja` next to a hidden noun says the noun is
//     feminine, which cuts the field in half before anyone speaks. Prefer
//     hints that do not inflect: a noun-ish adjective, or one whose masculine
//     and feminine forms are identical (`Grande`, `Verde`, `Brillante`).
//
//   - THE ARTICLE IS PART OF THE WORD, or it is not, but it has to be one or
//     the other everywhere. `Playa` and `La Playa` in the same catalogue read
//     as two different registers on the card. No articles is the rule here.
//
// AND ONE RULE ABOUT WHAT A HINT SHOULD BE, learned the hard way on Food.
//
// English hints are overwhelmingly PHYSICAL: what the thing looks, feels or
// tastes like. Cheesy, Stacked, Round, Melted, Glazed. Occasion words like
// Morning or Festive appear as the second hint, not as both.
//
// The gender rule above pushes hard the other way. Spanish sensory adjectives
// nearly all inflect (cremoso/a, salado/a, redondo/a, blando/a), so avoiding
// the leak drives you off adjectives and onto nouns, and nouns about food and
// animals skew towards occasions and places. The first draft of Food came out
// a third context hints against English's fifth, and entries like
// `Paella: Domingo / Compartir` were close to unguessable.
//
// The way out is physical NOUNS, which are concrete AND gender-safe:
//   texture and part   Corteza, Espuma, Grano, Hueso, Capas, Pulpa, Lámina
//   shape              Rodaja, Curva, Punta, Espiral, Franjas
//   body               Colmillo, Trompa, Aleta, Púas, Cresta, Caparazón
//   sound and movement Ladrido, Rugido, Aleteo, Galope, Croar
// plus the invariant sensory adjectives Spanish does have: Crujiente, Suave,
// Dulce, Caliente, Picante, Brillante, Fuerte, Veloz, Feroz, Frágil.
//
// So: EVERY ENTRY GETS AT LEAST ONE PHYSICAL HINT. The second may be an
// occasion, and often should be, because the impostor sees only one at random
// and that variance is what makes a round tense rather than solvable.
//
// A hint must also not NAME the thing. Regional origin is the trap here:
// `Valencia` on Paella or `Burgos` on Morcilla identifies the dish outright,
// and since only the impostor sees the hint, an identifying one hands them
// something safe to say and makes them impossible to catch.
export const WORD_CATEGORIES = {
  'Food': [
    { w: 'Paella', h: 'Grano', h2: 'Domingo' },
    { w: 'Tortilla', h: 'Capas', h2: 'Cena' },
    { w: 'Gazpacho', h: 'Calor', h2: 'Refrescante' },
    { w: 'Croquetas', h: 'Crujiente', h2: 'Sobras' },
    { w: 'Jamón', h: 'Bellota', h2: 'Pata' },
    { w: 'Chorizo', h: 'Pimentón', h2: 'Picante' },
    { w: 'Pulpo', h: 'Ventosa', h2: 'Feria' },
    { w: 'Fabada', h: 'Invierno', h2: 'Contundente' },
    { w: 'Salmorejo', h: 'Espesor', h2: 'Verano' },
    { w: 'Migas', h: 'Grumo', h2: 'Campo' },
    { w: 'Cocido', h: 'Humeante', h2: 'Abundante' },
    { w: 'Pisto', h: 'Mezcla', h2: 'Huerta' },
    { w: 'Bocadillo', h: 'Barra', h2: 'Recreo' },
    { w: 'Empanada', h: 'Masa', h2: 'Excursión' },
    { w: 'Morcilla', h: 'Sangre', h2: 'Fuerte' },
    { w: 'Lentejas', h: 'Marrón', h2: 'Colegio' },
    { w: 'Albóndigas', h: 'Salsa', h2: 'Abuela' },
    { w: 'Chuletón', h: 'Brasa', h2: 'Grande' },
    { w: 'Boquerones', h: 'Vinagre', h2: 'Bar' },
    { w: 'Gambas', h: 'Plancha', h2: 'Rosa' },
    { w: 'Mejillones', h: 'Concha', h2: 'Vapor' },
    { w: 'Calamares', h: 'Anillo', h2: 'Tinta' },
    { w: 'Bacalao', h: 'Sal', h2: 'Cuaresma' },
    { w: 'Sardinas', h: 'Humo', h2: 'Verbena' },
    { w: 'Merluza', h: 'Anzuelo', h2: 'Suave' },
    { w: 'Salchichón', h: 'Rodaja', h2: 'Tabla' },
    { w: 'Lomo', h: 'Filete', h2: 'Sartén' },
    { w: 'Solomillo', h: 'Corte', h2: 'Restaurante' },
    { w: 'Pimientos', h: 'Sorpresa', h2: 'Verde' },
    { w: 'Alcachofas', h: 'Hojas', h2: 'Espina' },
    { w: 'Espárragos', h: 'Tallo', h2: 'Lata' },
    { w: 'Berenjena', h: 'Aceite', h2: 'Brillante' },
    { w: 'Calabacín', h: 'Huerto', h2: 'Verde' },
    { w: 'Guisantes', h: 'Vaina', h2: 'Congelador' },
    { w: 'Judías', h: 'Vaina', h2: 'Puchero' },
    { w: 'Setas', h: 'Lámina', h2: 'Bosque' },
    { w: 'Champiñones', h: 'Sombrero', h2: 'Ajillo' },
    { w: 'Ajo', h: 'Diente', h2: 'Vampiro' },
    { w: 'Cebolla', h: 'Lágrima', h2: 'Capas' },
    { w: 'Tomate', h: 'Pulpa', h2: 'Ensalada' },
    { w: 'Patatas', h: 'Freidora', h2: 'Bastón' },
    { w: 'Zanahoria', h: 'Punta', h2: 'Crujiente' },
    { w: 'Lechuga', h: 'Cogollo', h2: 'Crujiente' },
    { w: 'Pepino', h: 'Frescor', h2: 'Piel' },
    { w: 'Aceitunas', h: 'Hueso', h2: 'Aperitivo' },
    { w: 'Queso', h: 'Agujero', h2: 'Loncha' },
    { w: 'Huevo', h: 'Cáscara', h2: 'Frágil' },
    { w: 'Pan', h: 'Corteza', h2: 'Horno' },
    { w: 'Arroz', h: 'Grano', h2: 'Oriente' },
    { w: 'Pasta', h: 'Trigo', h2: 'Tenedor' },
    { w: 'Churros', h: 'Domingo', h2: 'Azúcar' },
    { w: 'Turrón', h: 'Navidad', h2: 'Almendra' },
    { w: 'Polvorón', h: 'Migaja', h2: 'Anís' },
    { w: 'Mazapán', h: 'Figura', h2: 'Moldeable' },
    { w: 'Ensaimada', h: 'Espiral', h2: 'Isla' },
    { w: 'Torrijas', h: 'Semana', h2: 'Canela' },
    { w: 'Flan', h: 'Molde', h2: 'Temblor' },
    { w: 'Natillas', h: 'Galleta', h2: 'Vainilla' },
    { w: 'Buñuelos', h: 'Viento', h2: 'Crema' },
    { w: 'Magdalena', h: 'Desayuno', h2: 'Papel' },
    { w: 'Rosquilla', h: 'Agujero', h2: 'Romería' },
    { w: 'Bizcocho', h: 'Esponja', h2: 'Merienda' },
    { w: 'Helado', h: 'Cucurucho', h2: 'Playa' },
    { w: 'Chocolate', h: 'Cacao', h2: 'Tableta' },
    { w: 'Galletas', h: 'Crujido', h2: 'Mojar' },
    { w: 'Tarta', h: 'Cumpleaños', h2: 'Vela' },
    { w: 'Caramelo', h: 'Envoltorio', h2: 'Dulce' },
    { w: 'Miel', h: 'Panal', h2: 'Ámbar' },
    { w: 'Mermelada', h: 'Tostada', h2: 'Bote' },
    { w: 'Nata', h: 'Batidora', h2: 'Nube' },
    { w: 'Naranja', h: 'Cáscara', h2: 'Exprimidor' },
    { w: 'Manzana', h: 'Mordisco', h2: 'Newton' },
    { w: 'Plátano', h: 'Curva', h2: 'Resbalón' },
    { w: 'Fresa', h: 'Primavera', h2: 'Semilla' },
    { w: 'Sandía', h: 'Pepitas', h2: 'Enorme' },
    { w: 'Melón', h: 'Cáscara', h2: 'Rejilla' },
    { w: 'Uvas', h: 'Campanadas', h2: 'Racimo' },
    { w: 'Melocotón', h: 'Almíbar', h2: 'Pelusa' },
    { w: 'Cereza', h: 'Rabito', h2: 'Pareja' },
    { w: 'Pera', h: 'Cuello', h2: 'Compota' },
    { w: 'Piña', h: 'Corona', h2: 'Tropical' },
    { w: 'Limón', h: 'Mueca', h2: 'Rodaja' },
    { w: 'Aguacate', h: 'Hueso', h2: 'Untar' },
    { w: 'Higo', h: 'Breva', h2: 'Dulzor' },
    { w: 'Ciruela', h: 'Violeta', h2: 'Laxante' },
    { w: 'Mandarina', h: 'Gajo', h2: 'Fácil' },
    { w: 'Kiwi', h: 'Vello', h2: 'Zelanda' },
    { w: 'Frambuesa', h: 'Zarza', h2: 'Silvestre' },
    { w: 'Café', h: 'Amargor', h2: 'Despertar' },
    { w: 'Vino', h: 'Copa', h2: 'Cosecha' },
    { w: 'Cerveza', h: 'Caña', h2: 'Espuma' },
    { w: 'Sangría', h: 'Fruta', h2: 'Jarra' },
    { w: 'Horchata', h: 'Chufa', h2: 'Vaso' },
    { w: 'Zumo', h: 'Exprimir', h2: 'Cartón' },
    { w: 'Agua', h: 'Sed', h2: 'Grifo' },
    { w: 'Leche', h: 'Espuma', h2: 'Desayuno' },
    { w: 'Batido', h: 'Pajita', h2: 'Vaso' },
    { w: 'Sidra', h: 'Escanciar', h2: 'Botella' },
    { w: 'Vermut', h: 'Mediodía', h2: 'Hierbas' },
    { w: 'Tinto de Verano', h: 'Hielo', h2: 'Gaseosa' },
  ],
  'Animals': [
    { w: 'Perro', h: 'Ladrido', h2: 'Fiel' },
    { w: 'Gato', h: 'Ronroneo', h2: 'Bigote' },
    { w: 'Conejo', h: 'Salto', h2: 'Madriguera' },
    { w: 'Caballo', h: 'Galope', h2: 'Melena' },
    { w: 'Vaca', h: 'Ubre', h2: 'Pasto' },
    { w: 'Cerdo', h: 'Hocico', h2: 'Barro' },
    { w: 'Oveja', h: 'Lana', h2: 'Rebaño' },
    { w: 'Cabra', h: 'Cuernos', h2: 'Monte' },
    { w: 'Gallina', h: 'Cacareo', h2: 'Corral' },
    { w: 'Gallo', h: 'Cresta', h2: 'Amanecer' },
    { w: 'Pato', h: 'Pico', h2: 'Charca' },
    { w: 'Ratón', h: 'Cola', h2: 'Trampa' },
    { w: 'Burro', h: 'Orejas', h2: 'Carga' },
    { w: 'Toro', h: 'Astas', h2: 'Capote' },
    { w: 'Ganso', h: 'Graznido', h2: 'Bandada' },
    { w: 'Hámster', h: 'Rueda', h2: 'Mejillas' },
    { w: 'Loro', h: 'Plumas', h2: 'Repetir' },
    { w: 'Canario', h: 'Trino', h2: 'Jaula' },
    { w: 'Tortuga', h: 'Caparazón', h2: 'Siglo' },
    { w: 'León', h: 'Rugido', h2: 'Sabana' },
    { w: 'Tigre', h: 'Rayas', h2: 'Feroz' },
    { w: 'Elefante', h: 'Trompa', h2: 'Enorme' },
    { w: 'Jirafa', h: 'Cuello', h2: 'Manchas' },
    { w: 'Cebra', h: 'Franjas', h2: 'Manada' },
    { w: 'Mono', h: 'Rama', h2: 'Travesura' },
    { w: 'Oso', h: 'Garras', h2: 'Invierno' },
    { w: 'Lobo', h: 'Aullido', h2: 'Luna' },
    { w: 'Zorro', h: 'Astucia', h2: 'Gallinero' },
    { w: 'Ciervo', h: 'Cornamenta', h2: 'Bosque' },
    { w: 'Jabalí', h: 'Colmillo', h2: 'Cerdas' },
    { w: 'Lince', h: 'Sigilo', h2: 'Pincel' },
    { w: 'Erizo', h: 'Púas', h2: 'Bola' },
    { w: 'Ardilla', h: 'Nuez', h2: 'Ágil' },
    { w: 'Murciélago', h: 'Cueva', h2: 'Ecos' },
    { w: 'Topo', h: 'Túnel', h2: 'Oscuridad' },
    { w: 'Rinoceronte', h: 'Cuerno', h2: 'Coraza' },
    { w: 'Hipopótamo', h: 'Río', h2: 'Bostezo' },
    { w: 'Cocodrilo', h: 'Mandíbula', h2: 'Pantano' },
    { w: 'Serpiente', h: 'Escamas', h2: 'Veneno' },
    { w: 'Lagarto', h: 'Roca', h2: 'Sol' },
    { w: 'Camaleón', h: 'Color', h2: 'Lengua' },
    { w: 'Rana', h: 'Croar', h2: 'Verde' },
    { w: 'Sapo', h: 'Verruga', h2: 'Príncipe' },
    { w: 'Canguro', h: 'Bolsa', h2: 'Brinco' },
    { w: 'Koala', h: 'Eucalipto', h2: 'Sueño' },
    { w: 'Panda', h: 'Bambú', h2: 'Ojeras' },
    { w: 'Perezoso', h: 'Lentitud', h2: 'Garfio' },
    { w: 'Camello', h: 'Joroba', h2: 'Desierto' },
    { w: 'Alpaca', h: 'Escupir', h2: 'Andes' },
    { w: 'Mofeta', h: 'Olor', h2: 'Raya' },
    { w: 'Mapache', h: 'Antifaz', h2: 'Basura' },
    { w: 'Castor', h: 'Presa', h2: 'Dientes' },
    { w: 'Nutria', h: 'Panza', h2: 'Nado' },
    { w: 'Foca', h: 'Aleta', h2: 'Hielo' },
    { w: 'Morsa', h: 'Colmillos', h2: 'Polo' },
    { w: 'Reno', h: 'Trineo', h2: 'Nariz' },
    { w: 'Hurón', h: 'Tubo', h2: 'Agilidad' },
    { w: 'Comadreja', h: 'Rapidez', h2: 'Huevos' },
    { w: 'Marmota', h: 'Silbido', h2: 'Montaña' },
    { w: 'Águila', h: 'Vista', h2: 'Altura' },
    { w: 'Búho', h: 'Ojos', h2: 'Noche' },
    { w: 'Lechuza', h: 'Campanario', h2: 'Chillido' },
    { w: 'Halcón', h: 'Velocidad', h2: 'Cetrería' },
    { w: 'Cuervo', h: 'Carroña', h2: 'Presagio' },
    { w: 'Paloma', h: 'Plaza', h2: 'Arrullo' },
    { w: 'Gorrión', h: 'Pequeñez', h2: 'Ciudad' },
    { w: 'Golondrina', h: 'Verano', h2: 'Nido' },
    { w: 'Cigüeña', h: 'Zancas', h2: 'Bebés' },
    { w: 'Flamenco', h: 'Rosa', h2: 'Equilibrio' },
    { w: 'Pingüino', h: 'Frac', h2: 'Torpeza' },
    { w: 'Avestruz', h: 'Arena', h2: 'Zancada' },
    { w: 'Pavo Real', h: 'Abanico', h2: 'Vanidad' },
    { w: 'Cisne', h: 'Elegancia', h2: 'Lago' },
    { w: 'Gaviota', h: 'Puerto', h2: 'Grito' },
    { w: 'Colibrí', h: 'Aleteo', h2: 'Néctar' },
    { w: 'Pelícano', h: 'Buche', h2: 'Zambullida' },
    { w: 'Buitre', h: 'Círculos', h2: 'Espera' },
    { w: 'Urraca', h: 'Brillo', h2: 'Ruido' },
    { w: 'Petirrojo', h: 'Pecho', h2: 'Postal' },
    { w: 'Tiburón', h: 'Sangre', h2: 'Terror' },
    { w: 'Ballena', h: 'Chorro', h2: 'Inmensidad' },
    { w: 'Delfín', h: 'Sonar', h2: 'Sonrisa' },
    { w: 'Medusa', h: 'Gelatina', h2: 'Picor' },
    { w: 'Cangrejo', h: 'Pinza', h2: 'Lateral' },
    { w: 'Langosta', h: 'Antenas', h2: 'Lujo' },
    { w: 'Estrella de Mar', h: 'Brazos', h2: 'Cinco' },
    { w: 'Caballito de Mar', h: 'Vertical', h2: 'Alga' },
    { w: 'Anguila', h: 'Resbalar', h2: 'Electricidad' },
    { w: 'Salmón', h: 'Corriente', h2: 'Desove' },
    { w: 'Trucha', h: 'Arroyo', h2: 'Caña' },
    { w: 'Atún', h: 'Lata', h2: 'Banco' },
    { w: 'Orca', h: 'Espectáculo', h2: 'Familia' },
    { w: 'Manta', h: 'Planeo', h2: 'Fondo' },
    { w: 'Almeja', h: 'Concha', h2: 'Filtro' },
    { w: 'Barracuda', h: 'Torpedo', h2: 'Arrecife' },
    { w: 'Caracol', h: 'Baba', h2: 'Espiral' },
    { w: 'Mariposa', h: 'Alas', h2: 'Metamorfosis' },
    { w: 'Abeja', h: 'Aguijón', h2: 'Polen' },
    { w: 'Hormiga', h: 'Fila', h2: 'Fuerza' },
    { w: 'Araña', h: 'Tela', h2: 'Ocho' },
  ],
  'Places': [],
  'Everyday Objects': [],
  'Movies & TV': [],
  'Football': [],
  'Super Heroes': [],
};
