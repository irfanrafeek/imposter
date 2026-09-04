// ============================================================
// THE BRAZILIAN PORTUGUESE WORD CATALOGUE
// ============================================================
// SKELETON. The seven categories exist so that the locale is registered,
// the checker runs, and the catalogue can be filled a category at a time
// (#212). An empty catalogue is an anticipated state, not a broken one:
// loadCatalog() falls back to English and says so in the console, and
// check-words reports short categories as warnings until --strict.
//
// Written, not translated from en.js or es.js. Parity with either is
// explicitly not a goal: a category that does not land at a Brazilian
// table is worth less than a shorter one that does.
//
// BRAZILIAN, NOT NEUTRAL, AND THAT IS THE DIFFERENCE FROM SPANISH (#208).
// es.js is neutral Spanish on purpose, because neutral Spanish is a real
// register that Latin American dubbing has used for decades. There is no
// equivalent register for Portuguese. Brazil is roughly 95% of Portuguese
// speakers, the splits with European Portuguese are sharper than anything
// inside Spanish, and a catalogue trying to serve both would serve
// neither. So this list commits to Brazil.
//
// Two failures to watch for, and the second is the sneaky one:
//
//   THE THING IS PORTUGUESE, NOT BRAZILIAN.  Francesinha, bacalhau a bras,
//   a pastel de nata as an everyday thing rather than a bakery import.
//   Obvious once you look for it, and the easier of the two to catch.
//
//   THE THING IS UNIVERSAL AND THE WORD IS NOT.  Comboio, autocarro,
//   telemovel, frigorifico, casa de banho. These are not wrong Portuguese;
//   they are another country's Portuguese, and they read as foreign at a
//   Brazilian table. Trem, onibus, celular, geladeira, banheiro.
//
// AND ONE THAT SPANISH DID NOT HAVE. Brazil is one country but it is not
// one vocabulary, so the neutral-Spanish problem returns inside a single
// market. Mandioca, aipim and macaxeira are the same root in three regions.
// Everyone at the table sees the same secret word and has to give a clue
// for it, so a word half of them do not know stops the round rather than
// colouring it. Prefer the term that travels the whole country, and when
// no term does, prefer a different word.
//
// THE GENDER TRAP, exactly as in Spanish. An adjective hint carries gender,
// and a gendered adjective beside a gendered noun narrows the answer
// sharply. The checker warns on any hint token ending in -o or -a, which
// catches plenty of innocent nouns too, so GENDER_REVIEWED.pt in
// scripts/check-words.mjs is the allowlist of the ones that have been read
// and cleared. Prefer hints that do not inflect. Note the check does not
// run at all for a locale with no entry in that table.
//
// THE CATEGORY IDS STAY ENGLISH AND ASCII. 'Food', not 'Comida'. An id is
// the key into this catalogue, the value written to meta.categories and
// read by every other player in the room, the played-ledger key both on the
// room and in localStorage, and the analytics counter key. Only the display
// names move, and those live in the runtime string table as
// category.<id>.name and .desc. See the header of index.js and #135.
//
// The entry shape and the three hint bands are documented once, in
// index.js. Read that before writing a hint.

// WHAT A HINT SHOULD BE IN PORTUGUESE, which the gender rule above decides
// more than taste does. Portuguese sensory adjectives nearly all inflect
// (cremoso/a, salgado/a, redondo/a, macio/a), so writing the English hint
// bands straight across produces a leak on almost every entry. Three forms
// never inflect and all three sound like speech rather than a thesaurus:
//
//   INFINITIVE VERBS   Derreter, Espremer, Refogar, Tremer, Espalhar,
//                      Socar, Torrar. These are the workhorse. They end in
//                      -ar/-er/-ir, so they do not even reach the checker's
//                      -o/-a warning.
//   ADJECTIVES IN -E   Quente, Doce, Forte, Grande, Leve, Verde, Simples,
//                      Crocante, Brilhante, Fumegante.
//   CONCRETE NOUNS     Casca, Caroço, Espuma, Grão, Miolo, Espeto, Brasa.
//                      A noun carries its OWN gender rather than agreeing
//                      with the hidden word, so it leaks nothing. Most of
//                      GENDER_REVIEWED.pt is this.
//
// The bookish escape hatch is a trap, the same one Spanish hit: -idade and
// -ura forms (cremosidade, maciez) are gender-safe and nobody says them, and
// a page of them is exactly what reads as machine-written.
//
// EVERY ENTRY GETS AT LEAST ONE PHYSICAL HINT. The other may be an occasion,
// and often should be, since the impostor sees one at random and that
// variance is what makes a round tense instead of solvable.
//
// A hint must not NAME the thing, and in Brazil the trap is regional origin:
// Bahia on Acaraje or Minas on Pao de queijo identifies the dish outright,
// and only the impostor sees it, so an identifying hint hands them something
// safe to say and makes them impossible to catch.

export const WORD_CATEGORIES = {
  'Food': [
    { w: 'Feijoada', h: 'Sábado', h2: 'Fumegante', h3: 'Botequim' },
    { w: 'Pão de queijo', h: 'Bolinha', h2: 'Forno', h3: 'Padaria' },
    { w: 'Brigadeiro', h: 'Granulado', h2: 'Festa', h3: 'Aniversário' },
    { w: 'Coxinha', h: 'Fritura', h2: 'Recheio', h3: 'Lanchonete' },
    { w: 'Açaí', h: 'Polpa', h2: 'Tigela', h3: 'Academia' },
    { w: 'Farofa', h: 'Crocante', h2: 'Punhado', h3: 'Churrasqueira' },
    { w: 'Tapioca', h: 'Frigideira', h2: 'Dobra', h3: 'Barraquinha' },
    { w: 'Vatapá', h: 'Creme', h2: 'Colher', h3: 'Tabuleiro' },
    { w: 'Acarajé', h: 'Pimenta', h2: 'Fritura', h3: 'Tabuleiro' },
    { w: 'Moqueca', h: 'Panela', h2: 'Coentro', h3: 'Litoral' },
    { w: 'Churrasco', h: 'Espeto', h2: 'Domingo', h3: 'Quintal' },
    { w: 'Picanha', h: 'Gordura', h2: 'Fatia', h3: 'Rodízio' },
    { w: 'Pastel', h: 'Bolha', h2: 'Retângulo', h3: 'Feira' },
    { w: 'Empada', h: 'Forminha', h2: 'Tampinha', h3: 'Casamento' },
    { w: 'Esfiha', h: 'Triângulo', h2: 'Bandeja', h3: 'Entrega' },
    { w: 'Cuscuz', h: 'Vapor', h2: 'Flocos', h3: 'Manhã' },
    { w: 'Escondidinho', h: 'Camadas', h2: 'Gratinar', h3: 'Jantar' },
    { w: 'Strogonoff', h: 'Molho', h2: 'Palha', h3: 'Segunda' },
    { w: 'Lasanha', h: 'Andares', h2: 'Assadeira', h3: 'Almoço' },
    { w: 'Pizza', h: 'Rodela', h2: 'Borda', h3: 'Sexta' },
    { w: 'Hambúrguer', h: 'Pilha', h2: 'Guardanapo', h3: 'Lanchonete' },
    { w: 'Cachorro-quente', h: 'Salsicha', h2: 'Mostarda', h3: 'Carrinho' },
    { w: 'Torrada', h: 'Manteiga', h2: 'Estalo', h3: 'Café' },
    { w: 'Requeijão', h: 'Pote', h2: 'Espalhar', h3: 'Bisnaga' },
    { w: 'Doce de leite', h: 'Caramelo', h2: 'Colherada', h3: 'Sobremesa' },
    { w: 'Beijinho', h: 'Cravo', h2: 'Confeito', h3: 'Festinha' },
    { w: 'Quindim', h: 'Gema', h2: 'Brilhante', h3: 'Confeitaria' },
    { w: 'Pudim', h: 'Calda', h2: 'Tremer', h3: 'Forma' },
    { w: 'Bolo de cenoura', h: 'Cobertura', h2: 'Ralar', h3: 'Lanche' },
    { w: 'Paçoca', h: 'Farelo', h2: 'Fogueira', h3: 'Festa junina' },
    { w: 'Pé de moleque', h: 'Quebrar', h2: 'Grude', h3: 'Junho' },
    { w: 'Cocada', h: 'Melado', h2: 'Ralar', h3: 'Ambulante' },
    { w: 'Goiabada', h: 'Barra', h2: 'Cortar', h3: 'Queijo' },
    { w: 'Rapadura', h: 'Bloco', h2: 'Cana', h3: 'Feirinha' },
    { w: 'Canjica', h: 'Fogueira', h2: 'Canela', h3: 'Panelão' },
    { w: 'Pamonha', h: 'Palha', h2: 'Barbante', h3: 'Espiga' },
    { w: 'Pipoca', h: 'Estouro', h2: 'Sal', h3: 'Cinema' },
    { w: 'Mandioca', h: 'Raiz', h2: 'Casca', h3: 'Palito' },
    { w: 'Batata frita', h: 'Palito', h2: 'Óleo', h3: 'Sachê' },
    { w: 'Arroz', h: 'Grão', h2: 'Colher', h3: 'Almoço' },
    { w: 'Feijão', h: 'Caldo', h2: 'Concha', h3: 'Prato fundo' },
    { w: 'Macarrão', h: 'Fio', h2: 'Escorredor', h3: 'Garfo' },
    { w: 'Frango assado', h: 'Osso', h2: 'Barbante', h3: 'Domingo' },
    { w: 'Carne de sol', h: 'Varal', h2: 'Fibra', h3: 'Sertão' },
    { w: 'Linguiça', h: 'Tripa', h2: 'Rodela', h3: 'Feira' },
    { w: 'Costela', h: 'Brasa', h2: 'Paciência', h3: 'Churrasqueira' },
    { w: 'Bife', h: 'Chapa', h2: 'Ponto', h3: 'Prato feito' },
    { w: 'Ovo frito', h: 'Estalo', h2: 'Frigideira', h3: 'Manhã' },
    { w: 'Omelete', h: 'Dobra', h2: 'Batedor', h3: 'Pressa' },
    { w: 'Salada', h: 'Folhas', h2: 'Vinagre', h3: 'Verão' },
    { w: 'Sopa', h: 'Fumaça', h2: 'Concha', h3: 'Inverno' },
    { w: 'Sanduíche', h: 'Camadas', h2: 'Mordida', h3: 'Viagem' },
    { w: 'Torta', h: 'Massa', h2: 'Forma', h3: 'Chá' },
    { w: 'Sonho', h: 'Açúcar', h2: 'Creme', h3: 'Confeitaria' },
    { w: 'Churros', h: 'Canudo', h2: 'Canela', h3: 'Calçadão' },
    { w: 'Sorvete', h: 'Casquinha', h2: 'Derreter', h3: 'Calor' },
    { w: 'Picolé', h: 'Palito', h2: 'Gelo', h3: 'Verão' },
    { w: 'Vitamina', h: 'Liquidificador', h2: 'Espuma', h3: 'Copo' },
    { w: 'Suco de laranja', h: 'Espremer', h2: 'Polpa', h3: 'Manhã' },
    { w: 'Guaraná', h: 'Gás', h2: 'Latinha', h3: 'Aniversário' },
    { w: 'Caipirinha', h: 'Socar', h2: 'Gelo', h3: 'Boteco' },
    { w: 'Cerveja', h: 'Espuma', h2: 'Tulipa', h3: 'Sexta' },
    { w: 'Cafezinho', h: 'Coador', h2: 'Xícara', h3: 'Expediente' },
    { w: 'Chimarrão', h: 'Cuia', h2: 'Bomba', h3: 'Roda' },
    { w: 'Leite condensado', h: 'Lata', h2: 'Colher', h3: 'Receita' },
    { w: 'Queijo coalho', h: 'Grelha', h2: 'Espetinho', h3: 'Barraca' },
    { w: 'Mortadela', h: 'Fatias', h2: 'Mercadão', h3: 'Lanche' },
    { w: 'Pão francês', h: 'Miolo', h2: 'Sacola', h3: 'Padaria' },
    { w: 'Geleia', h: 'Pote', h2: 'Fruta', h3: 'Manhã' },
    { w: 'Mel', h: 'Escorrer', h2: 'Garganta', h3: 'Colmeia' },
    { w: 'Chocolate', h: 'Barra', h2: 'Tablete', h3: 'Páscoa' },
    { w: 'Banana', h: 'Casca', h2: 'Curva', h3: 'Lancheira' },
    { w: 'Manga', h: 'Caroço', h2: 'Fiapo', h3: 'Quintal' },
    { w: 'Abacaxi', h: 'Coroa', h2: 'Espinhos', h3: 'Rodela' },
    { w: 'Maracujá', h: 'Sementes', h2: 'Casca', h3: 'Sono' },
    { w: 'Caju', h: 'Castanha', h2: 'Talo', h3: 'Suco' },
    { w: 'Goiaba', h: 'Miolo', h2: 'Quintal', h3: 'Compota' },
    { w: 'Melancia', h: 'Listras', h2: 'Peso', h3: 'Verão' },
    { w: 'Mamão', h: 'Sementes', h2: 'Metade', h3: 'Manhã' },
    { w: 'Limão', h: 'Espremer', h2: 'Verde', h3: 'Tempero' },
    { w: 'Uva', h: 'Cacho', h2: 'Videira', h3: 'Vinho' },
    { w: 'Morango', h: 'Sementinhas', h2: 'Cabinho', h3: 'Chantilly' },
    { w: 'Coco', h: 'Canudo', h2: 'Casca dura', h3: 'Areia' },
    { w: 'Amendoim', h: 'Vagem', h2: 'Torrar', h3: 'Cinema' },
    { w: 'Yakisoba', h: 'Legumes', h2: 'Refogar', h3: 'Shopping' },
    { w: 'Temaki', h: 'Cone', h2: 'Alga', h3: 'Salmão' },
    { w: 'Salgadinho', h: 'Pacote', h2: 'Estalo', h3: 'Recreio' },
    { w: 'Kibe', h: 'Trigo', h2: 'Losango', h3: 'Boteco' },
    { w: 'Mingau', h: 'Aveia', h2: 'Panela', h3: 'Bebê' },
    { w: 'Bolinho de chuva', h: 'Fritadeira', h2: 'Canela', h3: 'Vovó' },
    { w: 'Galinhada', h: 'Açafrão', h2: 'Panelão', h3: 'Interior' },
    { w: 'Polenta', h: 'Fubá', h2: 'Bastão', h3: 'Inverno' },
    { w: 'Feijão tropeiro', h: 'Farinha', h2: 'Bacon', h3: 'Estrada' },
    { w: 'Torresmo', h: 'Pururuca', h2: 'Estalo', h3: 'Chope' },
    { w: 'Bolacha recheada', h: 'Torcer', h2: 'Creme', h3: 'Merenda' },
    { w: 'Pão de mel', h: 'Cobertura', h2: 'Especiarias', h3: 'Natal' },
    { w: 'Panetone', h: 'Caixa', h2: 'Passas', h3: 'Dezembro' },
    { w: 'Rabanada', h: 'Ensopar', h2: 'Canela', h3: 'Natal' },
    { w: 'Milho verde', h: 'Espiga', h2: 'Manteiga', h3: 'Fogueira' },
    { w: 'Mousse', h: 'Taça', h2: 'Leve', h3: 'Geladeira' },
  ],
  'Animals': [
    { w: 'Cachorro', h: 'Coleira', h2: 'Latido', h3: 'Passeio' },
    { w: 'Gato', h: 'Ronronar', h2: 'Bigodes', h3: 'Colo' },
    { w: 'Cavalo', h: 'Ferradura', h2: 'Galope', h3: 'Fazenda' },
    { w: 'Vaca', h: 'Chifre', h2: 'Pasto', h3: 'Curral' },
    { w: 'Porco', h: 'Lama', h2: 'Focinho', h3: 'Chiqueiro' },
    { w: 'Galinha', h: 'Penas', h2: 'Ciscar', h3: 'Quintal' },
    { w: 'Galo', h: 'Crista', h2: 'Esporão', h3: 'Amanhecer' },
    { w: 'Pato', h: 'Nadar', h2: 'Bico chato', h3: 'Lagoa' },
    { w: 'Peru', h: 'Papada', h2: 'Ceia', h3: 'Natal' },
    { w: 'Ovelha', h: 'Lã', h2: 'Rebanho', h3: 'Tosquia' },
    { w: 'Cabra', h: 'Barbicha', h2: 'Encosta', h3: 'Leite' },
    { w: 'Burro', h: 'Teimosia', h2: 'Carroça', h3: 'Roça' },
    { w: 'Coelho', h: 'Salto', h2: 'Orelhas', h3: 'Toca' },
    { w: 'Rato', h: 'Esgoto', h2: 'Rabo', h3: 'Armadilha' },
    { w: 'Morcego', h: 'Caverna', h2: 'Asas', h3: 'Noite' },
    { w: 'Macaco', h: 'Galho', h2: 'Travessura', h3: 'Zoológico' },
    { w: 'Onça', h: 'Pintas', h2: 'Emboscada', h3: 'Rastro' },
    { w: 'Capivara', h: 'Margem', h2: 'Bando', h3: 'Ciclovia' },
    { w: 'Tatu', h: 'Casco', h2: 'Buraco', h3: 'Sertão' },
    { w: 'Tamanduá', h: 'Língua', h2: 'Focinho', h3: 'Formigueiro' },
    { w: 'Preguiça', h: 'Lentidão', h2: 'Garras', h3: 'Galho' },
    { w: 'Arara', h: 'Bico', h2: 'Casal', h3: 'Bando' },
    { w: 'Tucano', h: 'Ninho', h2: 'Fruta', h3: 'Mata' },
    { w: 'Papagaio', h: 'Repetir', h2: 'Poleiro', h3: 'Pirata' },
    { w: 'Beija-flor', h: 'Zumbido', h2: 'Néctar', h3: 'Jardim' },
    { w: 'Coruja', h: 'Silêncio', h2: 'Pescoço', h3: 'Madrugada' },
    { w: 'Urubu', h: 'Círculos', h2: 'Carniça', h3: 'Poste' },
    { w: 'Sabiá', h: 'Canto', h2: 'Ninho', h3: 'Palmeira' },
    { w: 'Bem-te-vi', h: 'Grito', h2: 'Telhado', h3: 'Amanhecer' },
    { w: 'Pombo', h: 'Arrulho', h2: 'Migalhas', h3: 'Estátua' },
    { w: 'Jacaré', h: 'Mandíbula', h2: 'Brejo', h3: 'Dentes' },
    { w: 'Cobra', h: 'Veneno', h2: 'Rastejar', h3: 'Mato' },
    { w: 'Lagarto', h: 'Escamas', h2: 'Muro', h3: 'Sol' },
    { w: 'Sapo', h: 'Coaxar', h2: 'Charco', h3: 'Chuva' },
    { w: 'Tartaruga', h: 'Casco', h2: 'Areia', h3: 'Mergulho' },
    { w: 'Peixe', h: 'Cardume', h2: 'Guelras', h3: 'Aquário' },
    { w: 'Tubarão', h: 'Barbatana', h2: 'Medo', h3: 'Mar' },
    { w: 'Golfinho', h: 'Sonar', h2: 'Salto', h3: 'Baía' },
    { w: 'Baleia', h: 'Jato', h2: 'Canção', h3: 'Oceano' },
    { w: 'Polvo', h: 'Tentáculos', h2: 'Tinta', h3: 'Ventosa' },
    { w: 'Caranguejo', h: 'Pinça', h2: 'Manguezal', h3: 'Areia' },
    { w: 'Camarão', h: 'Antenas', h2: 'Rede', h3: 'Barco' },
    { w: 'Piranha', h: 'Dentes', h2: 'Rio', h3: 'Lenda' },
    { w: 'Pirarucu', h: 'Gigante', h2: 'Rede', h3: 'Amazonas' },
    { w: 'Boto', h: 'Lenda', h2: 'Nadadeira', h3: 'Rio' },
    { w: 'Formiga', h: 'Fileira', h2: 'Carregar', h3: 'Piquenique' },
    { w: 'Barata', h: 'Carapaça', h2: 'Escuridão', h3: 'Cozinha' },
    { w: 'Mosquito', h: 'Picada', h2: 'Repelente', h3: 'Ouvido' },
    { w: 'Aranha', h: 'Teia', h2: 'Oito', h3: 'Poeira' },
    { w: 'Borboleta', h: 'Asas', h2: 'Casulo', h3: 'Jardim' },
    { w: 'Vaga-lume', h: 'Brilho', h2: 'Piscar', h3: 'Sítio' },
    { w: 'Grilo', h: 'Perna', h2: 'Estridente', h3: 'Noite' },
    { w: 'Abelha', h: 'Ferrão', h2: 'Pólen', h3: 'Zumbido' },
    { w: 'Cupim', h: 'Madeira', h2: 'Túnel', h3: 'Fazenda' },
    { w: 'Minhoca', h: 'Terra', h2: 'Anzol', h3: 'Chuva' },
    { w: 'Caracol', h: 'Baba', h2: 'Espiral', h3: 'Horta' },
    { w: 'Lobo', h: 'Alcateia', h2: 'Uivo', h3: 'Lua' },
    { w: 'Raposa', h: 'Astúcia', h2: 'Rabo', h3: 'Fábula' },
    { w: 'Urso', h: 'Hibernar', h2: 'Pelagem', h3: 'Floresta' },
    { w: 'Leão', h: 'Juba', h2: 'Rugido', h3: 'Savana' },
    { w: 'Tigre', h: 'Listras', h2: 'Salto', h3: 'Selva' },
    { w: 'Elefante', h: 'Tromba', h2: 'Presas', h3: 'Memória' },
    { w: 'Girafa', h: 'Altura', h2: 'Manchas', h3: 'Folhas' },
    { w: 'Zebra', h: 'Riscas', h2: 'Manada', h3: 'Safári' },
    { w: 'Hipopótamo', h: 'Bocarra', h2: 'Barro', h3: 'Manada' },
    { w: 'Rinoceronte', h: 'Couraça', h2: 'Carga', h3: 'Savana' },
    { w: 'Canguru', h: 'Bolsa', h2: 'Pulo', h3: 'Austrália' },
    { w: 'Panda', h: 'Bambu', h2: 'Olheiras', h3: 'Zoológico' },
    { w: 'Pinguim', h: 'Gelo', h2: 'Barriga', h3: 'Fila' },
    { w: 'Foca', h: 'Bola', h2: 'Pedra', h3: 'Gelo' },
    { w: 'Camelo', h: 'Corcova', h2: 'Deserto', h3: 'Caravana' },
    { w: 'Avestruz', h: 'Corrida', h2: 'Cabeça', h3: 'Areia' },
    { w: 'Águia', h: 'Vista', h2: 'Penhasco', h3: 'Garra' },
    { w: 'Falcão', h: 'Velocidade', h2: 'Presa', h3: 'Céu' },
    { w: 'Pavão', h: 'Leque', h2: 'Vaidade', h3: 'Cauda' },
    { w: 'Cisne', h: 'Elegância', h2: 'Lago', h3: 'Pescoço' },
    { w: 'Flamingo', h: 'Rosa', h2: 'Equilíbrio', h3: 'Lagoa' },
    { w: 'Cegonha', h: 'Trouxa', h2: 'Chaminé', h3: 'Bebê' },
    { w: 'Pintinho', h: 'Piado', h2: 'Penugem', h3: 'Chocadeira' },
    { w: 'Bode', h: 'Cheiro', h2: 'Barba', h3: 'Encosta' },
    { w: 'Mico', h: 'Rabinho', h2: 'Bando', h3: 'Parque' },
    { w: 'Quati', h: 'Anéis', h2: 'Focinho', h3: 'Trilha' },
    { w: 'Gambá', h: 'Fedor', h2: 'Rabo peludo', h3: 'Susto' },
    { w: 'Ouriço', h: 'Espinhos', h2: 'Enrolar', h3: 'Folhas' },
    { w: 'Esquilo', h: 'Bochechas', h2: 'Estoque', h3: 'Tronco' },
    { w: 'Cervo', h: 'Galhada', h2: 'Bosque', h3: 'Timidez' },
    { w: 'Anta', h: 'Sementes', h2: 'Lama', h3: 'Mata' },
    { w: 'Lobo-guará', h: 'Pernas', h2: 'Solidão', h3: 'Campo' },
    { w: 'Bicho-da-seda', h: 'Fio', h2: 'Casulo', h3: 'Tecido' },
    { w: 'Estrela-do-mar', h: 'Cinco', h2: 'Maré', h3: 'Piscina natural' },
    { w: 'Água-viva', h: 'Transparente', h2: 'Queimadura', h3: 'Mar' },
    { w: 'Bagre', h: 'Bigode', h2: 'Lodo', h3: 'Anzol' },
    { w: 'Arraia', h: 'Ferrão', h2: 'Fundo', h3: 'Areia' },
    { w: 'Jabuti', h: 'Casco', h2: 'Passo', h3: 'Quintal' },
    { w: 'Camaleão', h: 'Disfarce', h2: 'Cores', h3: 'Ramo' },
    { w: 'Escorpião', h: 'Pinças', h2: 'Fenda', h3: 'Alerta' },
    { w: 'Lagartixa', h: 'Parede', h2: 'Teto', h3: 'Luz' },
    { w: 'Pônei', h: 'Crina', h2: 'Cercado', h3: 'Aniversário' },
    { w: 'Marimbondo', h: 'Ferroada', h2: 'Beiral', h3: 'Correria' },
    { w: 'Sagui', h: 'Tufos', h2: 'Fruta', h3: 'Poste' },
  ],
  'Places': [
    { w: 'Praia', h: 'Onda', h2: 'Guarda-sol', h3: 'Protetor' },
    { w: 'Cachoeira', h: 'Queda', h2: 'Musgo', h3: 'Trilha' },
    { w: 'Serra', h: 'Neblina', h2: 'Curvas', h3: 'Estrada' },
    { w: 'Montanha', h: 'Cume', h2: 'Subida', h3: 'Botas' },
    { w: 'Vale', h: 'Ladeiras', h2: 'Sombra', h3: 'Névoa' },
    { w: 'Ilha', h: 'Isolamento', h2: 'Balsa', h3: 'Barco' },
    { w: 'Duna', h: 'Vento', h2: 'Escorregar', h3: 'Buggy' },
    { w: 'Gruta', h: 'Escuridão', h2: 'Eco', h3: 'Lanterna' },
    { w: 'Riacho', h: 'Correnteza', h2: 'Pedrinhas', h3: 'Pescaria' },
    { w: 'Represa', h: 'Comporta', h2: 'Turbina', h3: 'Energia' },
    { w: 'Pantanal', h: 'Charco', h2: 'Imensidão', h3: 'Cheia' },
    { w: 'Caatinga', h: 'Seca', h2: 'Galhos', h3: 'Cactos' },
    { w: 'Amazônia', h: 'Umidade', h2: 'Copas', h3: 'Canoa' },
    { w: 'Orla', h: 'Calçada', h2: 'Bicicleta', h3: 'Coqueiros' },
    { w: 'Píer', h: 'Tábuas', h2: 'Barcos', h3: 'Pescador' },
    { w: 'Farol', h: 'Rochas', h2: 'Navio', h3: 'Feixe' },
    { w: 'Porto', h: 'Contêiner', h2: 'Guindaste', h3: 'Carga' },
    { w: 'Rodoviária', h: 'Malas', h2: 'Espera', h3: 'Poltrona' },
    { w: 'Aeroporto', h: 'Esteira', h2: 'Embarque', h3: 'Passaporte' },
    { w: 'Metrô', h: 'Vagão', h2: 'Catraca', h3: 'Túnel' },
    { w: 'Ponto de ônibus', h: 'Abrigo', h2: 'Placa', h3: 'Cartão' },
    { w: 'Ponte', h: 'Vão', h2: 'Cabos', h3: 'Travessia' },
    { w: 'Viaduto', h: 'Concreto', h2: 'Sombra', h3: 'Trânsito' },
    { w: 'Rodovia', h: 'Asfalto', h2: 'Pedágio', h3: 'Caminhões' },
    { w: 'Estação', h: 'Plataforma', h2: 'Apito', h3: 'Bilhete' },
    { w: 'Escola', h: 'Recreio', h2: 'Uniforme', h3: 'Merenda' },
    { w: 'Universidade', h: 'Campus', h2: 'Calouros', h3: 'Bandejão' },
    { w: 'Biblioteca', h: 'Silêncio', h2: 'Fichas', h3: 'Estantes' },
    { w: 'Hospital', h: 'Corredor', h2: 'Plantão', h3: 'Soro' },
    { w: 'Posto de saúde', h: 'Senha', h2: 'Vacina', h3: 'Cartaz' },
    { w: 'Farmácia', h: 'Prateleiras', h2: 'Balança', h3: 'Receita' },
    { w: 'Açougue', h: 'Balcão', h2: 'Cutelo', h3: 'Ganchos' },
    { w: 'Mercearia', h: 'Fiado', h2: 'Bairro', h3: 'Freguês' },
    { w: 'Supermercado', h: 'Carrinho', h2: 'Corredores', h3: 'Cupom' },
    { w: 'Camelódromo', h: 'Barracas', h2: 'Pechincha', h3: 'Movimento' },
    { w: 'Feira livre', h: 'Lona', h2: 'Pregão', h3: 'Sacolas' },
    { w: 'Banca de jornal', h: 'Revistas', h2: 'Esquina', h3: 'Balas' },
    { w: 'Barbearia', h: 'Navalha', h2: 'Cadeira', h3: 'Espelho' },
    { w: 'Salão de beleza', h: 'Secador', h2: 'Fofoca', h3: 'Esmalte' },
    { w: 'Igreja', h: 'Sinos', h2: 'Vitral', h3: 'Missa' },
    { w: 'Cemitério', h: 'Lápides', h2: 'Velas', h3: 'Novembro' },
    { w: 'Delegacia', h: 'Boletim', h2: 'Grades', h3: 'Depoimento' },
    { w: 'Cartório', h: 'Carimbo', h2: 'Reconhecer', h3: 'Papelada' },
    { w: 'Banco', h: 'Cofre', h2: 'Extrato', h3: 'Gerente' },
    { w: 'Correios', h: 'Selos', h2: 'Encomenda', h3: 'Etiqueta' },
    { w: 'Estádio', h: 'Arquibancada', h2: 'Gramado', h3: 'Torcida' },
    { w: 'Ginásio', h: 'Quadra', h2: 'Alambrado', h3: 'Torneio' },
    { w: 'Piscina', h: 'Cloro', h2: 'Trampolim', h3: 'Boia' },
    { w: 'Vestiário', h: 'Armários', h2: 'Chuveiro', h3: 'Bancos' },
    { w: 'Teatro', h: 'Cortina', h2: 'Coxia', h3: 'Aplausos' },
    { w: 'Museu', h: 'Guia', h2: 'Placas', h3: 'Réplica' },
    { w: 'Circo', h: 'Picadeiro', h2: 'Trapézio', h3: 'Algodão-doce' },
    { w: 'Playground', h: 'Balanço', h2: 'Gangorra', h3: 'Joelho ralado' },
    { w: 'Praça', h: 'Coreto', h2: 'Chafariz', h3: 'Domingo' },
    { w: 'Mirante', h: 'Guarda-corpo', h2: 'Binóculo', h3: 'Foto' },
    { w: 'Hotel', h: 'Recepção', h2: 'Chave', h3: 'Diária' },
    { w: 'Pousada', h: 'Varanda', h2: 'Rede', h3: 'Sossego' },
    { w: 'Camping', h: 'Barraca', h2: 'Estacas', h3: 'Fogueira' },
    { w: 'Chácara', h: 'Pomar', h2: 'Portão', h3: 'Feriado' },
    { w: 'Engenho', h: 'Moenda', h2: 'Melaço', h3: 'Alambique' },
    { w: 'Celeiro', h: 'Fardos', h2: 'Ratoeira', h3: 'Colheita' },
    { w: 'Estufa', h: 'Mudas', h2: 'Vidro', h3: 'Umidade' },
    { w: 'Cerrado', h: 'Arbustos', h2: 'Terra vermelha', h3: 'Queimada' },
    { w: 'Vulcão', h: 'Cratera', h2: 'Lava', h3: 'Cinzas' },
    { w: 'Geleira', h: 'Rachadura', h2: 'Iceberg', h3: 'Casaco' },
    { w: 'Oásis', h: 'Miragem', h2: 'Água', h3: 'Camelos' },
    { w: 'Apartamento', h: 'Elevador', h2: 'Vizinhos', h3: 'Condomínio' },
    { w: 'Casa', h: 'Aluguel', h2: 'Mudança', h3: 'Chaves' },
    { w: 'Quarto', h: 'Cama', h2: 'Bagunça', h3: 'Despertador' },
    { w: 'Sala', h: 'Sofá', h2: 'Controle remoto', h3: 'Visita' },
    { w: 'Banheiro', h: 'Azulejo', h2: 'Descarga', h3: 'Toalha' },
    { w: 'Garagem', h: 'Ferramentas', h2: 'Manchas', h3: 'Caixas' },
    { w: 'Sótão', h: 'Baús', h2: 'Teias', h3: 'Lembranças' },
    { w: 'Porão', h: 'Mofo', h2: 'Degraus', h3: 'Ratos' },
    { w: 'Escritório', h: 'Baias', h2: 'Reunião', h3: 'Crachá' },
    { w: 'Fábrica', h: 'Turnos', h2: 'Galpão', h3: 'Ruído' },
    { w: 'Canteiro de obras', h: 'Capacete', h2: 'Andaime', h3: 'Cimento' },
    { w: 'Oficina', h: 'Graxa', h2: 'Chave inglesa', h3: 'Pneu' },
    { w: 'Posto de gasolina', h: 'Mangueira', h2: 'Frentista', h3: 'Conveniência' },
    { w: 'Restaurante', h: 'Cardápio', h2: 'Garçom', h3: 'Conta' },
    { w: 'Bar', h: 'Petiscos', h2: 'Mesinhas', h3: 'Sinuca' },
    { w: 'Boate', h: 'Luzes', h2: 'Batida', h3: 'Madrugada' },
    { w: 'Sambódromo', h: 'Desfile', h2: 'Alegorias', h3: 'Fevereiro' },
    { w: 'Quiosque', h: 'Toldo', h2: 'Cadeiras', h3: 'Areia' },
    { w: 'Terminal', h: 'Baldeação', h2: 'Catracas', h3: 'Multidão' },
    { w: 'Presídio', h: 'Vigia', h2: 'Pátio', h3: 'Visitas' },
    { w: 'Quartel', h: 'Alvorada', h2: 'Marcha', h3: 'Farda' },
    { w: 'Creche', h: 'Berços', h2: 'Choro', h3: 'Fraldas' },
    { w: 'Asilo', h: 'Bengalas', h2: 'Rotina', h3: 'Álbum' },
    { w: 'Laboratório', h: 'Jaleco', h2: 'Amostras', h3: 'Microscópio' },
    { w: 'Estúdio', h: 'Microfone', h2: 'Cabine', h3: 'Gravação' },
    { w: 'Auditório', h: 'Palco', h2: 'Fileiras', h3: 'Palestra' },
    { w: 'Galeria', h: 'Lojinhas', h2: 'Centro', h3: 'Teto baixo' },
    { w: 'Mercado municipal', h: 'Bancas', h2: 'Vitrais', h3: 'Degustação' },
    { w: 'Sorveteria', h: 'Potes', h2: 'Sabores', h3: 'Casquinha' },
    { w: 'Livraria', h: 'Lançamentos', h2: 'Marcadores', h3: 'Café' },
    { w: 'Papelaria', h: 'Cadernos', h2: 'Canetas', h3: 'Matrícula' },
    { w: 'Pet shop', h: 'Banho', h2: 'Tosa', h3: 'Coleira' },
    { w: 'Lavanderia', h: 'Máquinas', h2: 'Sabão', h3: 'Cabides' },
    { w: 'Depósito', h: 'Empilhadeira', h2: 'Poeira', h3: 'Inventário' },
  ],
  'Everyday Objects': [],
  'Movies & TV': [],
  'Football': [],
  'Super Heroes': [],
};
