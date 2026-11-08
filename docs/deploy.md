# Deploy (manutentori)

Note operative per chi gestisce il sito: non riguardano chi usa Diagonale.

## Dominio personalizzato (diagonalecalcio.it)

Il deploy legge la variabile di repository `PAGES_DOMAIN`. Senza la variabile il sito resta su `https://iltempe.github.io/diagonale/`; con la variabile sito e app vanno alla radice del dominio (`/` e `/app/`), e i vecchi indirizzi github.io vengono reindirizzati da GitHub.

1. Dal pannello DNS del registrar crea questi record per `diagonalecalcio.it`:
   - `A` `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` `@` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` *(facoltativi, solo IPv6: se il pannello non li accetta si possono omettere)*
   - `CNAME` `www` → `iltempe.github.io.`
2. Quando i record sono visibili, esegui `scripts/activate-domain.sh diagonalecalcio.it`. Lo script controlla i DNS e procede solo se puntano a GitHub Pages; poi imposta la variabile, collega il dominio e avvia il deploy.
3. Appena GitHub emette il certificato, attiva HTTPS obbligatorio.
