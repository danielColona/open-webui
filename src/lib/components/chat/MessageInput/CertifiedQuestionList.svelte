<script lang="ts">
	// HeadendAI - dropdown de autocomplete de perguntas certificadas
	// (28/08/2026, ver docs/fork/FORK-autocomplete-certificado.md no
	// repo do HeadendAI). Opcao B do doc de handoff: painel flutuante
	// FORA do editor TipTap (nao usa getSuggestionRenderer, diferente
	// de CommandSuggestionList.svelte neste mesmo diretorio) - menor
	// superficie de patch, sem risco de conflito ao atualizar upstream.
	//
	// Auto-contido de proposito: registra o proprio listener de
	// keydown (fase de CAPTURA, `on:keydown|capture` na svelte:window)
	// enquanto tem sugestoes visiveis, ao inves de exigir que
	// MessageInput.svelte seja alterado pra delegar teclas pra ca -
	// MessageInput.svelte so precisa renderizar este componente, nada
	// de script novo la. `id="suggestions-container"` no wrapper
	// reaproveita um mecanismo que JA EXISTE em MessageInput.svelte
	// (linha ~2069: `document.getElementById('suggestions-container')`
	// suprime o Enter-envia quando esse elemento existe) - actua como
	// rede de seguranca extra, mesmo com o preventDefault/stopPropagation
	// proprios abaixo ja bastando pra maioria dos casos.
	//
	// De proposito SEM indicador de "carregando": o container so existe
	// no DOM quando ha sugestao de verdade (suggestions.length > 0) -
	// mostra-lo tambem durante o fetch (sem item nenhum ainda) faria o
	// mecanismo de supressao de Enter-envia (acima) ativar sem que o
	// handleWindowKeydown tenha nada pra selecionar, travando o Enter
	// por ~200-400ms (nem envia, nem seleciona) - pior que so nao
	// mostrar nada nesse intervalo curto.
	import { getCertifiedSuggestions, type CertifiedSuggestion } from '$lib/apis/headend';

	export let query = '';
	export let onSelect: (texto: string) => void = () => {};

	let suggestions: CertifiedSuggestion[] = [];
	let selectedIdx = 0;
	let debounceTimer: ReturnType<typeof setTimeout>;
	let containerEl: HTMLDivElement | undefined;

	// So true depois que o operador navega com seta pra valer. Enquanto
	// falso, Enter NAO seleciona a sugestao destacada por padrao (idx 0) -
	// evita roubar o Enter de quem so quer enviar o que escreveu, mesmo
	// com o dropdown aberto por baixo (achado real 28/08/2026, reportado
	// pelo usuario: Enter "inocente" selecionava a 1a sugestao em vez de
	// enviar a pergunta digitada).
	let navegou = false;

	// Nao mostrar enquanto o operador estiver no meio de um comando
	// especial (/, #, @, $, :) do proprio Open WebUI - evita 2
	// dropdowns competindo pelo mesmo id="suggestions-container" ao
	// mesmo tempo (CommandSuggestionList cobre esses casos).
	const TRIGGERS_ESPECIAIS = ['/', '#', '@', '$', ':'];

	$: emComandoEspecial = TRIGGERS_ESPECIAIS.some((c) => query.trimStart().startsWith(c));

	$: if (query !== undefined) {
		clearTimeout(debounceTimer);

		if (!query || query.trim().length < 2 || emComandoEspecial) {
			suggestions = [];
		} else {
			debounceTimer = setTimeout(() => buscar(query), 200);
		}
	}

	// requestToken (nao AbortController) de proposito: o bloco reativo acima
	// so le `query`/`emComandoEspecial` - se usasse AbortController (reatribuido
	// aqui dentro de buscar(), uma funcao assincrona), a propria reatribuicao
	// dispararia o bloco reativo de novo (Svelte re-executa `$:` sempre que uma
	// dependencia rastreada muda, mesmo vinda de fora), abortando a busca que
	// acabou de comecar - bug real encontrado 28/08/2026: o backend respondia
	// 200 OK (confirmado nos logs), mas o navegador descartava a resposta antes
	// do await completar, `suggestions` nunca era preenchido, dropdown nunca
	// aparecia. requestToken so e lido dentro de buscar(), nunca no bloco `$:`,
	// entao reatribui-lo nao causa o mesmo ciclo.
	let requestToken = 0;

	const buscar = async (texto: string) => {
		const meuToken = ++requestToken;
		try {
			const resultado = await getCertifiedSuggestions(texto);
			if (meuToken !== requestToken) return; // resposta obsoleta, ignora
			suggestions = resultado;
			selectedIdx = 0;
			navegou = false;
		} catch (e) {
			console.error('HeadendAI sugestoes:', e);
		}
	};

	const selectUp = () => {
		navegou = true;
		selectedIdx = Math.max(0, selectedIdx - 1);
	};

	const selectDown = () => {
		navegou = true;
		selectedIdx = Math.min(selectedIdx + 1, suggestions.length - 1);
	};

	const select = () => {
		const item = suggestions[selectedIdx];
		if (item) {
			suggestions = [];
			onSelect(item.texto);
		}
	};

	// O campo de chat fica perto do rodape da tela - quando o painel abre
	// pra baixo (top-full) e nao ha espaco sobrando ate o fim da janela,
	// ele fica cortado/escondido. Rola a janela o minimo necessario assim
	// que o painel entra no DOM (roda 1x por abertura, via Svelte action).
	const rolarParaVisivel = (node: HTMLElement) => {
		node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	};

	const handleWindowKeydown = (event: KeyboardEvent) => {
		if (suggestions.length === 0) return;

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopPropagation();
			selectUp();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			event.stopPropagation();
			selectDown();
		} else if (event.key === 'Tab') {
			// Tab nao tem uso nativo dentro do campo de texto - continua
			// completando a sugestao destacada mesmo sem navegacao previa
			// (atalho tipo "tab-complete" de terminal, sem o risco do Enter).
			event.preventDefault();
			event.stopPropagation();
			select();
		} else if (event.key === 'Enter') {
			if (navegou) {
				event.preventDefault();
				event.stopPropagation();
				select();
			} else {
				// Enter sem navegacao explicita = intencao de ENVIAR o que foi
				// digitado, nao selecionar a sugestao destacada por padrao.
				// Remove o painel do DOM na hora (nao so via `suggestions = []`,
				// que so aplica no proximo microtask do Svelte) pra que o
				// `document.getElementById('suggestions-container')` que
				// MessageInput.svelte ja faz no MESMO evento de keydown
				// (sincrono, antes desse microtask) nao ache mais o elemento
				// e deixe o Enter seguir pro envio normal.
				containerEl?.remove();
				suggestions = [];
			}
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			suggestions = [];
		}
	};
</script>

<svelte:window on:keydown|capture={handleWindowKeydown} />

{#if suggestions.length > 0}
	<!--
		Sem wrapper proprio de posicionamento - o pai (MessageInput.svelte,
		div.px-2.relative envolvendo #chat-input-container) ja fornece o
		contexto "position: relative" certo. Um wrapper extra aqui faria
		"top-full" cair relativo a ESTE elemento (altura zero, ja que o
		unico filho e absolutely positioned) em vez de cair logo abaixo do
		campo de texto de verdade.
	-->
	<div
		bind:this={containerEl}
		id="suggestions-container"
		use:rolarParaVisivel
		class="absolute top-full mt-2 w-full max-w-xl z-50 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-850 text-gray-900 dark:text-white shadow-lg overflow-hidden"
	>
		<div class="max-h-60 overflow-y-auto overflow-x-hidden scrollbar-thin text-xs p-1">
			{#each suggestions as item, idx}
				<button
					type="button"
					class="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left {idx ===
					selectedIdx
						? 'bg-gray-100 dark:bg-gray-800'
						: 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}"
					data-selected={idx === selectedIdx}
					on:mouseenter={() => (selectedIdx = idx)}
					on:click={() => {
						selectedIdx = idx;
						select();
					}}
				>
					<span class="flex-1 truncate">{item.texto}</span>
					<span class="shrink-0 text-gray-400 dark:text-gray-500">{item.intencao}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}
