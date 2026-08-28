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
	let abortController: AbortController | null = null;

	// Nao mostrar enquanto o operador estiver no meio de um comando
	// especial (/, #, @, $, :) do proprio Open WebUI - evita 2
	// dropdowns competindo pelo mesmo id="suggestions-container" ao
	// mesmo tempo (CommandSuggestionList cobre esses casos).
	const TRIGGERS_ESPECIAIS = ['/', '#', '@', '$', ':'];

	$: emComandoEspecial = TRIGGERS_ESPECIAIS.some((c) => query.trimStart().startsWith(c));

	$: if (query !== undefined) {
		clearTimeout(debounceTimer);
		abortController?.abort();

		if (!query || query.trim().length < 2 || emComandoEspecial) {
			suggestions = [];
		} else {
			debounceTimer = setTimeout(() => buscar(query), 200);
		}
	}

	const buscar = async (texto: string) => {
		abortController = new AbortController();
		try {
			const resultado = await getCertifiedSuggestions(texto, abortController.signal);
			suggestions = resultado;
			selectedIdx = 0;
		} catch (e) {
			if ((e as Error)?.name !== 'AbortError') {
				console.error('HeadendAI sugestoes:', e);
			}
		}
	};

	const selectUp = () => {
		selectedIdx = Math.max(0, selectedIdx - 1);
	};

	const selectDown = () => {
		selectedIdx = Math.min(selectedIdx + 1, suggestions.length - 1);
	};

	const select = () => {
		const item = suggestions[selectedIdx];
		if (item) {
			suggestions = [];
			onSelect(item.texto);
		}
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
		} else if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();
			select();
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
		id="suggestions-container"
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
