<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, fly, scale } from 'svelte/transition';
    import { Button, FAB, DateField } from 'm3-svelte';
    import { toYYYYMMDD, searchCheapestInPeriod, searchCheapestOneWayInPeriod, isCheapestResult, type CheapestResult } from '$lib/api/flights';
    import type { OneWaySearchOptions, RoundTripSearchOptions } from '$lib/api/flights';

    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    async function openLink(url: string) {
        if (isTauri) {
            const { openUrl } = await import('@tauri-apps/plugin-opener');
            await openUrl(url);
        } else {
            window.open(url, '_blank');
        }
    }

    let from = $state('');
    let to = $state('');
    let days = $state(5);
    let departDate = $state('');
    let returnDate = $state('');
    let oneWay = $state(false);
    let loading = $state(false);
    let searchProgress = $state<{ done: number; total: number } | null>(null);
    let error = $state('');
    let results = $state<CheapestResult[]>([]);
    let filtersOpen = $state(false);
    let preferWeekends = $state(false);
    let durationMode = $state<'exact' | 'plus-minus'>('exact');
    let durationVariation = $state(1);
    let preferredAirlines = $state<string[]>([]);
    let filtersLoaded = $state(false);

    const airlineOptions = ['Delta', 'American', 'United', 'Southwest', 'JetBlue', 'Spirit', 'Frontier', 'Alaska'];
    const FILTER_STORAGE_KEY = 'clovis.filters.v1';

    const timeOnly = (dateTime: string) => dateTime.split(' ')[1] ?? dateTime;

    function togglePreferredAirline(airline: string) {
        preferredAirlines = preferredAirlines.includes(airline)
            ? preferredAirlines.filter((a) => a !== airline)
            : [...preferredAirlines, airline];
    }

    function airlineRank(airline: string) {
        const idx = preferredAirlines.indexOf(airline);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    }

    function orderResultsByAirlinePreference(list: CheapestResult[]) {
        if (!oneWay || preferredAirlines.length === 0) return list;
        return [...list].sort((a, b) => {
            const rankDelta = airlineRank(a.outbound.airline) - airlineRank(b.outbound.airline);
            if (rankDelta !== 0) return rankDelta;
            return a.totalPrice - b.totalPrice;
        });
    }

    onMount(() => {
        try {
            const raw = localStorage.getItem(FILTER_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as {
                    oneWay?: boolean;
                    preferWeekends?: boolean;
                    durationMode?: 'exact' | 'plus-minus';
                    durationVariation?: number;
                    preferredAirlines?: string[];
                };
                oneWay = !!parsed.oneWay;
                preferWeekends = !!parsed.preferWeekends;
                durationMode = parsed.durationMode === 'plus-minus' ? 'plus-minus' : 'exact';
                const variation = Number(parsed.durationVariation);
                durationVariation = Number.isFinite(variation) ? Math.min(10, Math.max(0, Math.trunc(variation))) : 1;
                preferredAirlines = Array.isArray(parsed.preferredAirlines)
                    ? parsed.preferredAirlines.filter((airline) => airlineOptions.includes(airline))
                    : [];
            }
        } catch {
        } finally {
            filtersLoaded = true;
        }
    });

    $effect(() => {
        if (!filtersLoaded) return;
        localStorage.setItem(
            FILTER_STORAGE_KEY,
            JSON.stringify({
                oneWay,
                preferWeekends,
                durationMode,
                durationVariation,
                preferredAirlines
            })
        );
    });

    function swapAirports() {
        const previousFrom = from;
        from = to;
        to = previousFrom;
    }

    async function runSearch() {
        error = '';
        results = [];
        searchProgress = null;
        if (!from?.trim() || !to?.trim()) {
            error = 'Enter origin and destination.';
            return;
        }
        loading = true;
        try {
            const periodStart = toYYYYMMDD(departDate as unknown as Date);
            const periodEnd = toYYYYMMDD(returnDate as unknown as Date);
            if (!periodStart || !periodEnd) {
                error = 'Select both period dates.';
                return;
            }
            if (oneWay) {
                const opts: OneWaySearchOptions = {
                    onProgress: (done, total) => { searchProgress = { done, total }; }
                };
                const periodResults = await searchCheapestOneWayInPeriod(from, to, periodStart, periodEnd, opts);
                results = orderResultsByAirlinePreference(periodResults.filter(isCheapestResult));
                if (results.length === 0) error = 'No valid date combinations in this period.';
            } else {
                if (days < 1 || days > 30) {
                    error = 'Trip length must be 1–30 days.';
                    return;
                }
                if (durationMode === 'plus-minus' && (durationVariation < 0 || durationVariation > 10)) {
                    error = 'Variation must be 0–10 days.';
                    return;
                }
                const opts: RoundTripSearchOptions = {
                    preferWeekends,
                    durationMode,
                    durationVariation,
                    onProgress: (done, total) => { searchProgress = { done, total }; }
                };
                const periodResults = await searchCheapestInPeriod(from, to, periodStart, periodEnd, days, opts);
                results = periodResults.filter(isCheapestResult);
                if (results.length === 0) error = 'No valid date combinations in this period.';
            }
        } catch (e) {
            error = e instanceof Error ? e.message : 'Search failed.';
        } finally {
            loading = false;
            searchProgress = null;
        }
    }

    function openFilters() {
        filtersOpen = true;
    }
</script>

<div class="flex flex-col items-center justify-center mt-4">
    <h1 class="title">Where to?</h1>
</div>

{#if filtersOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-scrim/60 p-4" transition:fade={{ duration: 180 }}>
        <div class="w-full max-w-2xl rounded-3xl bg-surface-container p-6 shadow-2xl ring-1 ring-outline-variant/40" in:scale={{ duration: 200, start: 0.96 }} out:scale={{ duration: 160, start: 0.96 }}>
            <div class="mb-5 flex items-center justify-between">
                <h2 class="text-2xl font-extrabold text-on-surface">Filters</h2>
                <Button variant="text" onclick={() => (filtersOpen = false)}>
                    Close
                </Button>
            </div>
            <div class="space-y-5">
                <div class="rounded-2xl bg-surface-container-high p-4">
                    <h3 class="font-bold text-on-surface">Trip type</h3>
                    <div class="mt-3 grid gap-3 sm:grid-cols-2">
                        <button
                            class={`rounded-xl border px-4 py-3 text-left ${oneWay ? 'border-outline-variant bg-surface-container text-on-surface' : 'border-primary bg-primary-container text-on-primary-container'}`}
                            onclick={() => (oneWay = false)}
                        >
                            Round trip
                        </button>
                        <button
                            class={`rounded-xl border px-4 py-3 text-left ${oneWay ? 'border-primary bg-primary-container text-on-primary-container' : 'border-outline-variant bg-surface-container text-on-surface'}`}
                            onclick={() => (oneWay = true)}
                        >
                            One way
                        </button>
                    </div>
                </div>
                {#if !oneWay}
                    <div class="rounded-2xl bg-surface-container-high p-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="font-bold text-on-surface">Prefer weekends</h3>
                                <p class="text-sm text-on-surface-variant">For trips longer than 2 days, center dates near Fri-Sun.</p>
                            </div>
                            <input type="checkbox" class="h-5 w-5 accent-primary" bind:checked={preferWeekends} />
                        </div>
                    </div>
                    <div class="rounded-2xl bg-surface-container-high p-4">
                        <h3 class="font-bold text-on-surface">Trip duration mode</h3>
                        <div class="mt-3 grid gap-3 sm:grid-cols-2">
                            <button
                                class={`rounded-xl border px-4 py-3 text-left ${durationMode === 'exact' ? 'border-primary bg-primary-container text-on-primary-container' : 'border-outline-variant bg-surface-container text-on-surface'}`}
                                onclick={() => (durationMode = 'exact')}
                            >
                                Exact days
                            </button>
                            <button
                                class={`rounded-xl border px-4 py-3 text-left ${durationMode === 'plus-minus' ? 'border-primary bg-primary-container text-on-primary-container' : 'border-outline-variant bg-surface-container text-on-surface'}`}
                                onclick={() => (durationMode = 'plus-minus')}
                            >
                                +/- range
                            </button>
                        </div>
                        {#if durationMode === 'plus-minus'}
                            <div class="mt-3 flex items-center gap-3">
                                <span class="text-sm font-semibold text-on-surface-variant">Variation</span>
                                <div class="rounded-xl bg-surface p-2">
                                    <input type="number" min="0" max="10" class="w-16 bg-transparent text-center font-bold text-on-surface outline-none" bind:value={durationVariation} />
                                </div>
                                <span class="text-sm text-on-surface-variant">days</span>
                            </div>
                        {/if}
                    </div>
                {/if}
                <div class="rounded-2xl bg-surface-container-high p-4">
                    <div class="mb-3">
                        <h3 class="font-bold text-on-surface">Preferred airlines</h3>
                        <p class="text-sm text-on-surface-variant">Selected airlines are shown first in one-way results.</p>
                    </div>
                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {#each airlineOptions as airline}
                            <button
                                class={`rounded-xl border px-3 py-2 text-sm font-semibold ${preferredAirlines.includes(airline) ? 'border-primary bg-secondary-container text-on-secondary-container' : 'border-outline-variant bg-surface text-on-surface'}`}
                                onclick={() => togglePreferredAirline(airline)}
                            >
                                {airline}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="flex justify-end gap-3">
                    <Button variant="outlined" onclick={() => {
                        preferWeekends = false;
                        durationMode = 'exact';
                        durationVariation = 1;
                        preferredAirlines = [];
                    }}>
                        Reset
                    </Button>
                    <Button variant="filled" onclick={() => (filtersOpen = false)}>
                        Done
                    </Button>
                </div>
            </div>
        </div>
    </div>
{/if}

<div class="flex flex-row items-center justify-center mt-4">
    <div class="flex bg-surface-container p-5 rounded-2xl">
        <input type="text" class="w-full font-bold text-xl" placeholder="XYZ" bind:value={from} />
    </div>
    <div class="button-mod mx-12">
        <Button variant="outlined" square onclick={swapAirports}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M5.825 16L7.7 17.875q.275.275.275.688t-.275.712q-.3.3-.712.3t-.713-.3L2.7 15.7q-.15-.15-.213-.325T2.426 15t.063-.375t.212-.325l3.6-3.6q.3-.3.7-.287t.7.312q.275.3.288.7t-.288.7L5.825 14H12q.425 0 .713.288T13 15t-.288.713T12 16zm12.35-6H12q-.425 0-.712-.288T11 9t.288-.712T12 8h6.175L16.3 6.125q-.275-.275-.275-.687t.275-.713q.3-.3.713-.3t.712.3L21.3 8.3q.15.15.212.325t.063.375t-.063.375t-.212.325l-3.6 3.6q-.3.3-.7.288t-.7-.313q-.275-.3-.288-.7t.288-.7z"/></svg>
        </Button>
    </div>
    <div class="flex bg-surface-container p-5 rounded-2xl">
        <input type="text" class="w-full font-bold text-xl" placeholder="XYZ" bind:value={to} />
    </div>
    <div class="flex mx-5">
        <FAB
            color="secondary-container"
            icon={{
                body: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4.4 19.425q-.5.2-.95-.088T3 18.5V14l8-2l-8-2V5.5q0-.55.45-.837t.95-.088l15.4 6.5q.625.275.625.925t-.625.925z"/></svg>`
            }}
            click={runSearch}
        />
    </div>
</div>

<div class="flex flex-row items-center justify-center mt-4">
    {#if oneWay}
        <h1 class="font-extrabold text-xl mx-5"> Between </h1>
        <div>
            <DateField label="Date" bind:date={departDate} />
        </div>
        <h1 class="font-extrabold text-xl mx-5"> and </h1>
        <div>
            <DateField label="Date" bind:date={returnDate} />
        </div>
    {:else}
        <h1 class="font-extrabold text-xl mx-5"> For </h1>
        <div class="flex bg-surface-container p-3 rounded-2xl">
            <input type="number" class="w-10 font-bold text-xl" placeholder="5" min="1" max="30" bind:value={days} />
        </div>
        <h1 class="font-extrabold text-xl mx-5"> days, between </h1>
        <div>
            <DateField label="Date" bind:date={departDate} />
        </div>
        <h1 class="font-extrabold text-xl mx-5"> and </h1>
        <div>
            <DateField label="Date" bind:date={returnDate} />
        </div>
    {/if}
    <div class="flex mx-5 button-mod">
        <Button variant="filled" onclick={openFilters}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M11 18q-.425 0-.712-.288T10 17t.288-.712T11 16h2q.425 0 .713.288T14 17t-.288.713T13 18zm-4-5q-.425 0-.712-.288T6 12t.288-.712T7 11h10q.425 0 .713.288T18 12t-.288.713T17 13zM4 8q-.425 0-.712-.288T3 7t.288-.712T4 6h16q.425 0 .713.288T21 7t-.288.713T20 8z"/></svg>        
        </Button>
    </div>
</div>

<div class="flex justify-center mt-3">
    <p class="text-xs text-on-surface-variant max-w-xl text-center opacity-70">
        Make use of filters to reduce the number of combinations sent to Google Flights. Too many at once may cause rate limiting.
    </p>
</div>

{#if loading}
    <div class="text-center mt-4">
        {#if searchProgress && searchProgress.total > 0}
            <p>Checking {searchProgress.done} / {searchProgress.total} combinations…</p>
            <div class="mt-2 mx-auto w-64 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                    class="h-full rounded-full bg-primary transition-all duration-300"
                    style="width: {Math.round((searchProgress.done / searchProgress.total) * 100)}%"
                ></div>
            </div>
        {:else}
            <p>Searching…</p>
        {/if}
    </div>
{:else if error}
    <p class="text-center mt-4 text-red-600">{error}</p>
{:else if results.length > 0}
    <div class="mt-4 w-full max-w-2xl mx-auto px-4" in:fade={{ duration: 220 }}>
        <h2 class="font-semibold text-lg mb-2">Cheapest Options</h2>
        <ul class="space-y-2">
            {#each results as r, index (r.departDate + (r.returnDate ?? ''))}
                <li class="grid grid-cols-[1fr_auto] bg-surface-container p-3 rounded-xl gap-y-2" in:fly={{ y: 14, duration: 260, delay: index * 45 }} out:fade={{ duration: 120 }}>
                    <div class="flex items-center">
                        <span class="font-bold">
                            {#if r.returnDate}
                                {r.departDate} → {r.returnDate}
                            {:else}
                                {r.departDate}
                            {/if}
                        </span>
                    </div>
                    <div class="flex items-center justify-center">
                        <span class="font-semibold text-primary">
                            {#if r.totalPrice === Infinity}
                                —
                            {:else}
                                ${r.totalPrice}
                            {/if}
                        </span>
                    </div>
                    <div class="flex items-center mt-1 gap-2">
                        <div class="bg-surface-container-highest p-3 rounded-2xl">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M20.2 11.825L6.2 15.6q-.65.175-1.263-.075t-.962-.825L1.7 10.9q-.275-.425-.087-.9t.687-.6l.575-.15q.25-.05.488-.012t.437.212l2.4 2l3.5-.925l-4.075-5.45q-.4-.525-.2-1.137t.85-.788l.525-.125q.275-.075.588-.025t.537.25L14.9 9.125l4.25-1.15q.8-.225 1.513.188t.937 1.212t-.187 1.513t-1.213.937M4 21q-.425 0-.712-.288T3 20t.288-.712T4 19h16q.425 0 .713.288T21 20t-.288.713T20 21z"/></svg>
                        </div>
                        <div class="flex flex-col">
                            <span class="font-medium text-sm">
                                {#if r.return}
                                    {timeOnly(r.outbound.departureTime)} → {timeOnly(r.outbound.arrivalTime)} • {r.outbound.duration} --- {timeOnly(r.return.departureTime)} → {timeOnly(r.return.arrivalTime)} • {r.return.duration}
                                {:else}
                                    {timeOnly(r.outbound.departureTime)} → {timeOnly(r.outbound.arrivalTime)} • {r.outbound.duration}
                                {/if}
                            </span>
                            <span class="text-secondary text-sm">{r.outbound.airline} {r.outbound.flightNumber}</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-center button-mod2">
                        <Button variant="outlined" onclick={() => openLink(r.searchUrl)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h7v2H5v14h14v-7h2v7q0 .825-.587 1.413T19 21zm4.7-5.3l-1.4-1.4L17.6 5H14V3h7v7h-2V6.4z"/></svg>
                        </Button>
                    </div>
                </li>
            {/each}
        </ul>
    </div>
{/if}









<style>
    .title {
		color: var(--color-on-surface);
		font-size: 36px;
		font-family: 'Roboto Flex', sans-serif;
		font-weight: 1000;
		font-style: normal;
		line-height: 36px;
		font-variation-settings:
			'slnt' 0,
			'wdth' 151,
			'GRAD' -130,
			'XOPQ' 81,
			'XTRA' 511,
			'YOPQ' 86,
			'YTAS' 750,
			'YTDE' -203,
			'YTFI' 738,
			'YTLC' 555,
			'YTUC' 760;
	}

    .button-mod :global(button) {
		scale: 1;
        height: 50px;
	}

	.button-mod :global(svg) {
		scale: 1.2;
	}
</style>