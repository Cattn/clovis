<script lang="ts">
    import { Button, FAB, DateField } from 'm3-svelte';
    import { toYYYYMMDD, searchCheapestInPeriod, isCheapestResult, type CheapestResult } from '$lib/api/flights';

    let from = $state('');
    let to = $state('');
    let days = $state(5);
    let departDate = $state('');
    let returnDate = $state('');
    let loading = $state(false);
    let error = $state('');
    let results = $state<CheapestResult[]>([]);

    const timeOnly = (dateTime: string) => dateTime.split(' ')[1] ?? dateTime;

    const sampleResults: CheapestResult[] = [
        {
            from: 'PBI',
            to: 'LGA',
            departDate: '2025-03-01',
            returnDate: '2025-03-06',
            totalPrice: 287,
            bookingUrl: 'https://www.google.com/travel/flights/booking?tfs=CBwQAhpA&hl=en-US&gl=US&curr=USD',
            searchUrl: 'https://www.google.com/travel/flights/search?q=Flights+from+PBI+to+LGA&hl=en-US&gl=US&curr=USD',
            outbound: {
                price: 165,
                airline: 'Delta',
                airlineCode: 'DL',
                flightNumber: 'DL2532',
                origin: 'PBI',
                destination: 'LGA',
                departureTime: '2025-03-01 07:30',
                arrivalTime: '2025-03-01 10:17',
                duration: '2h 47m',
                stops: 0,
                aircraft: 'Boeing 737',
                token: 'sample-outbound-1',
                segments: [
                    { origin: 'PBI', originName: 'Palm Beach International Airport', destination: 'LGA', destinationName: 'LaGuardia Airport', departureTime: '07:30', arrivalTime: '10:17', duration: '2h 47m', flightNumber: 'DL2532', airline: 'Delta', aircraft: 'Boeing 737' }
                ],
                layovers: []
            },
            return: {
                price: 122,
                airline: 'Delta',
                airlineCode: 'DL',
                flightNumber: 'DL2460',
                origin: 'LGA',
                destination: 'PBI',
                departureTime: '2025-03-06 15:37',
                arrivalTime: '2025-03-06 18:52',
                duration: '3h 15m',
                stops: 0,
                aircraft: 'Boeing 737',
                token: 'sample-return-1',
                segments: [
                    { origin: 'LGA', originName: 'LaGuardia Airport', destination: 'PBI', destinationName: 'Palm Beach International Airport', departureTime: '15:37', arrivalTime: '18:52', duration: '3h 15m', flightNumber: 'DL2460', airline: 'Delta', aircraft: 'Boeing 737' }
                ],
                layovers: []
            }
        },
        {
            from: 'PBI',
            to: 'LGA',
            departDate: '2025-03-02',
            returnDate: '2025-03-07',
            totalPrice: 312,
            bookingUrl: 'https://www.google.com/travel/flights/booking?tfs=CBwQAhpB&hl=en-US&gl=US&curr=USD',
            searchUrl: 'https://www.google.com/travel/flights/search?q=Flights+from+PBI+to+LGA&hl=en-US&gl=US&curr=USD',
            outbound: {
                price: 198,
                airline: 'JetBlue',
                airlineCode: 'B6',
                flightNumber: 'B6123',
                origin: 'PBI',
                destination: 'LGA',
                departureTime: '2025-03-02 06:00',
                arrivalTime: '2025-03-02 09:22',
                duration: '3h 22m',
                stops: 0,
                aircraft: 'A320',
                token: 'sample-outbound-2',
                segments: [
                    { origin: 'PBI', originName: 'Palm Beach International Airport', destination: 'LGA', destinationName: 'LaGuardia Airport', departureTime: '06:00', arrivalTime: '09:22', duration: '3h 22m', flightNumber: 'B6123', airline: 'JetBlue', aircraft: 'A320' }
                ],
                layovers: []
            },
            return: {
                price: 114,
                airline: 'American',
                airlineCode: 'AA',
                flightNumber: 'AA456',
                origin: 'LGA',
                destination: 'PBI',
                departureTime: '2025-03-07 14:00',
                arrivalTime: '2025-03-07 17:30',
                duration: '3h 30m',
                stops: 0,
                aircraft: '',
                token: 'sample-return-2',
                segments: [
                    { origin: 'LGA', originName: 'LaGuardia Airport', destination: 'PBI', destinationName: 'Palm Beach International Airport', departureTime: '14:00', arrivalTime: '17:30', duration: '3h 30m', flightNumber: 'AA456', airline: 'American', aircraft: '' }
                ],
                layovers: []
            }
        },
        {
            from: 'PBI',
            to: 'LGA',
            departDate: '2025-03-03',
            returnDate: '2025-03-08',
            totalPrice: 265,
            bookingUrl: 'https://www.google.com/travel/flights/booking?tfs=CBwQAhpC&hl=en-US&gl=US&curr=USD',
            searchUrl: 'https://www.google.com/travel/flights/search?q=Flights+from+PBI+to+LGA&hl=en-US&gl=US&curr=USD',
            outbound: {
                price: 142,
                airline: 'Spirit',
                airlineCode: 'NK',
                flightNumber: 'NK789',
                origin: 'PBI',
                destination: 'LGA',
                departureTime: '2025-03-03 11:15',
                arrivalTime: '2025-03-03 14:45',
                duration: '3h 30m',
                stops: 1,
                aircraft: 'A320',
                token: 'sample-outbound-3',
                segments: [
                    { origin: 'PBI', originName: 'Palm Beach International Airport', destination: 'FLL', destinationName: 'Fort Lauderdale-Hollywood International', departureTime: '11:15', arrivalTime: '11:50', duration: '35m', flightNumber: 'NK789', airline: 'Spirit', aircraft: 'A320' },
                    { origin: 'FLL', originName: 'Fort Lauderdale-Hollywood International', destination: 'LGA', destinationName: 'LaGuardia Airport', departureTime: '13:00', arrivalTime: '14:45', duration: '2h 45m', flightNumber: 'NK789', airline: 'Spirit', aircraft: 'A320' }
                ],
                layovers: [{ airport: 'FLL', airportName: 'Fort Lauderdale-Hollywood International', duration: '1h 10m' }]
            },
            return: {
                price: 123,
                airline: 'Spirit',
                airlineCode: 'NK',
                flightNumber: 'NK790',
                origin: 'LGA',
                destination: 'PBI',
                departureTime: '2025-03-08 16:00',
                arrivalTime: '2025-03-08 20:15',
                duration: '4h 15m',
                stops: 0,
                aircraft: 'A320',
                token: 'sample-return-3',
                segments: [
                    { origin: 'LGA', originName: 'LaGuardia Airport', destination: 'PBI', destinationName: 'Palm Beach International Airport', departureTime: '16:00', arrivalTime: '20:15', duration: '4h 15m', flightNumber: 'NK790', airline: 'Spirit', aircraft: 'A320' }
                ],
                layovers: []
            }
        },
        {
            from: 'PBI',
            to: 'LGA',
            departDate: '2025-03-08',
            returnDate: '2025-03-13',
            totalPrice: 341,
            bookingUrl: 'https://www.google.com/travel/flights/booking?tfs=CBwQAhpD&hl=en-US&gl=US&curr=USD',
            searchUrl: 'https://www.google.com/travel/flights/search?q=Flights+from+PBI+to+LGA&hl=en-US&gl=US&curr=USD',
            outbound: {
                price: 212,
                airline: 'Delta',
                airlineCode: 'DL',
                flightNumber: 'DL2532',
                origin: 'PBI',
                destination: 'LGA',
                departureTime: '2025-03-08 07:30',
                arrivalTime: '2025-03-08 10:17',
                duration: '2h 47m',
                stops: 0,
                aircraft: '',
                token: 'sample-outbound-4',
                segments: [
                    { origin: 'PBI', originName: 'Palm Beach International Airport', destination: 'LGA', destinationName: 'LaGuardia Airport', departureTime: '07:30', arrivalTime: '10:17', duration: '2h 47m', flightNumber: 'DL2532', airline: 'Delta', aircraft: '' }
                ],
                layovers: []
            },
            return: {
                price: 129,
                airline: 'Delta',
                airlineCode: 'DL',
                flightNumber: 'DL2460',
                origin: 'LGA',
                destination: 'PBI',
                departureTime: '2025-03-13 15:37',
                arrivalTime: '2025-03-13 18:52',
                duration: '3h 15m',
                stops: 0,
                aircraft: '',
                token: 'sample-return-4',
                segments: [
                    { origin: 'LGA', originName: 'LaGuardia Airport', destination: 'PBI', destinationName: 'Palm Beach International Airport', departureTime: '15:37', arrivalTime: '18:52', duration: '3h 15m', flightNumber: 'DL2460', airline: 'Delta', aircraft: '' }
                ],
                layovers: []
            }
        }
    ];

    async function runSearch() {
        error = '';
        results = [];
        const periodStart = toYYYYMMDD(departDate as unknown as Date);
        const periodEnd = toYYYYMMDD(returnDate as unknown as Date);
        if (!from?.trim() || !to?.trim()) {
            error = 'Enter origin and destination.';
            return;
        }
        if (!periodStart || !periodEnd) {
            error = 'Select both period dates.';
            return;
        }
        if (days < 1 || days > 30) {
            error = 'Trip length must be 1–30 days.';
            return;
        }
        loading = true;
        try {
            const periodResults = await searchCheapestInPeriod(from, to, periodStart, periodEnd, days);
            results = periodResults.filter(isCheapestResult);
            if (results.length === 0) error = 'No valid date combinations in this period.';
        } catch (e) {
            error = e instanceof Error ? e.message : 'Search failed.';
        } finally {
            loading = false;
        }
    }
</script>

<div class="flex flex-col items-center justify-center mt-4">
    <h1 class="title">Where to?</h1>
</div>

<div class="flex flex-row items-center justify-center mt-4">
    <div class="flex bg-surface-container p-5 rounded-2xl">
        <input type="text" class="w-full font-bold text-xl" placeholder="XYZ" bind:value={from} />
    </div>
    <div class="button-mod mx-12">
        <Button variant="outlined" square>
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
</div>

{#if loading}
    <p class="text-center mt-4">Searching…</p>
{:else if error}
    <p class="text-center mt-4 text-red-600">{error}</p>
{:else if results.length > 0}
    <div class="mt-4 w-full max-w-2xl mx-auto px-4">
        <h2 class="font-semibold text-lg mb-2">Cheapest Options</h2>
        <ul class="space-y-2">
            {#each results as r (r.departDate + r.returnDate)}
                <li class="grid grid-cols-[1fr_auto] bg-surface-container p-3 rounded-xl gap-y-2">
                    <div class="flex items-center">
                        <span class="font-bold">{r.departDate} → {r.returnDate}</span>
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
                            <span class="font-medium text-sm">{timeOnly(r.outbound.departureTime)} → {timeOnly(r.outbound.arrivalTime)} • {r.outbound.duration} --- {timeOnly(r.return.departureTime)} → {timeOnly(r.return.arrivalTime)} • {r.return.duration}</span>
                            <span class="text-secondary text-sm">{r.outbound.airline} {r.outbound.flightNumber}</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-center button-mod2">
                        <Button variant="outlined" onclick={() => window.open(r.searchUrl, '_blank')}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M5 21q-.825 0-1.412-.587T3 19V5q0-.825.588-1.412T5 3h7v2H5v14h14v-7h2v7q0 .825-.587 1.413T19 21zm4.7-5.3l-1.4-1.4L17.6 5H14V3h7v7h-2V6.4z"/></svg>
                        </Button>
                    </div>
                </li>
            {/each}
        </ul>
    </div>
{/if}

{#if results.length === 0}
<div class="mt-6 w-full max-w-2xl mx-auto px-4">
    <h2 class="font-semibold text-lg mb-2">Sample results</h2>
    <ul class="space-y-2">
        {#each sampleResults as r (r.departDate + r.returnDate)}
            <li class="grid grid-cols-[1fr_auto] bg-surface-container p-3 rounded-xl gap-y-2">
                <div class="flex items-center">
                    <span class="font-bold">{r.departDate} → {r.returnDate}</span>
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
                        <span class="font-medium text-sm">{timeOnly(r.outbound.departureTime)} → {timeOnly(r.return.arrivalTime)} • {r.outbound.duration}</span>
                        <span class="text-secondary text-sm">{r.outbound.airline} {r.outbound.flightNumber}</span>
                    </div>
                </div>
                <div class="flex items-center justify-center button-mod2">
                    <Button variant="outlined" onclick={() => window.open(r.searchUrl, '_blank')}>
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