// HeadendAI / ComH3@ - texto a ser lido em voz alta (07/09/2026).
//
// O TTS do Open WebUI fala `message.content` INTEIRO. Numa resposta do
// HeadendAI isso significa ler a tabela Markdown celula por celula
// ("pipe SID pipe Nome pipe TS..."), o que e inutil de ouvir - e a
// resposta de "quais canais nao tem legenda" tem ate 300 linhas.
//
// O pipe (projects/python/openwebui/pipe_headendai.py) marca a frase
// falada num comentario HTML, invisivel no chat renderizado - a mesma
// convencao ja usada pro estado de esclarecimento. A tela continua
// recebendo a tabela inteira; muda so o que a voz recebe.
//
// O resumo e montado DETERMINISTICAMENTE pelo motor a partir do dado que
// ele mesmo produziu (parsers/fala_resumo.py). Nao passa por LLM: o
// modelo local foi medido em 4,1 tokens/s e, pedindo pra resumir "13
// canais passam de 15 Mbps", respondeu "Dois canais" em 3 de 3
// tentativas - ver docs/ANALISE-VOZ.md no repo do HeadendAI.

const MARCADOR_FALA = /<!--FALA:([\s\S]*?)-->/;

/**
 * Texto que deve ser falado para um conteudo de mensagem.
 * Sem marcador, devolve o proprio conteudo - qualquer outro modelo
 * instalado no Open WebUI continua funcionando como antes.
 */
export const textoParaFala = (conteudo: string): string => {
	if (!conteudo) return '';
	const achado = conteudo.match(MARCADOR_FALA);
	return achado?.[1]?.trim() || conteudo;
};

/** Remove o marcador do texto exibido/copiado. */
export const semMarcadorDeFala = (conteudo: string): string =>
	(conteudo ?? '').replace(new RegExp(MARCADOR_FALA.source, 'g'), '').trim();
