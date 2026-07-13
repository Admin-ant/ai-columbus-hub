## Doel

Netqloud en AI van Columbus volledig scheiden in de sidebar. Wanneer je in Columbus werkt zie je alleen Columbus-onderdelen; wanneer je in Netqloud werkt zie je alleen Netqloud-onderdelen. Schakelen tussen bedrijven doe je via de bedrijfs-switcher bovenin (of via de knop in de sidebar).

Voor nu bouwen we in Netqloud nog geen nieuwe functionaliteit — puur de scheiding.

## Wat er nu mis gaat

In `src/components/app-sidebar.tsx` staan drie dingen tegelijk zichtbaar:
1. Een grote "Algemeen"-lijst (Sales Workflow, Offerte Studio, Cold Outreach, Leads, Contracten, Mail, CRM, Enterprise, Teams) — die hoort feitelijk bij Columbus.
2. Een sectie "AI van Columbus" met eigen submenu.
3. Een sectie "Netqloud" met eigen submenu.

Daardoor lijken alle Columbus-schermen ook bij Netqloud te horen, en zie je in Columbus alsnog Netqloud in het menu staan. Dat is verwarrend.

## Nieuwe structuur van de sidebar

De sidebar wordt afhankelijk van de **actieve omgeving** (`currentOrganization` uit `useWorkspace`):

- **Als actieve omgeving = AI van Columbus**  
  Toon alleen Columbus-gerelateerde items:
  - Overzicht (dashboard)
  - Sales Workflow
  - Leads funnel
  - Offerte Studio
  - Cold Outreach
  - Contracten
  - Mail (+ instellingen + templates)
  - CRM Activiteiten
  - Klanten
  - Projecten dashboard
  - Offertes
  - Facturen
  - Inkoopfacturen
  - Modellen & gebruik
  - Rapportages
  - Logs
  - Instellingen (Columbus)

- **Als actieve omgeving = Netqloud**  
  Toon alleen Netqloud-items (voorlopig alleen de bestaande stubs):
  - Dashboard
  - Klanten
  - Servers
  - Offertes
  - Facturen
  - Inkoopfacturen
  - Instellingen
  - (Enterprise / Teams verplaatsen we hier niet naartoe — die blijven Columbus, tenzij je anders wilt)

- **Beheer-sectie** (Opname, Administratie, Gebruikers) blijft altijd zichtbaar voor admins — dat is holding-breed.

De bovenste header van de sidebar laat duidelijk zien in welk bedrijf je zit (naam + brand color, dat blok bestaat al). De "AI van Columbus" / "Netqloud" secties met "Open omgeving" verdwijnen — schakelen gaat via de **WorkspaceSwitcher** in de topbar (die staat al klaar in `src/components/workspace-switcher.tsx`).

## Wisselen van bedrijf

- Bovenin blijft de bestaande WorkspaceSwitcher; als je daar Netqloud kiest, verandert de sidebar meteen naar het Netqloud-menu en navigeert de app naar `/netqloud`.
- Kies je Columbus, dan verandert de sidebar naar het Columbus-menu en gaat de app naar `/ai-columbus` (of `/` overzicht — zie vraag hieronder).

## Wat we NIET aanraken

- Geen database-wijzigingen.
- Geen nieuwe Netqloud-schermen; de bestaande stub-pagina's (`netqloud.index`, `netqloud.klanten`, `netqloud.servers`, `netqloud.instellingen`) blijven zoals ze zijn.
- Routes verplaatsen we niet — Columbus-routes blijven op hun huidige URL's. Alleen de zichtbaarheid in het menu verandert per actieve omgeving.

## Technische wijzigingen

Alleen `src/components/app-sidebar.tsx`:
- `topItems`, `sections`, `adminItems` vervangen door twee menu-definities: `columbusMenu` en `netqloudMenu`.
- Op basis van `currentOrganization?.slug` (`"ai-columbus"` of `"netqloud"`) render je het juiste menu.
- Sectie "Open omgeving" met submenu verwijderen.
- Beheer-blok blijft, ongewijzigd.

## Vraag voordat ik het bouw

Wanneer je van Columbus naar Netqloud switcht, wil je dan:
- **(a)** automatisch naar het Netqloud-dashboard (`/netqloud`) gestuurd worden, of
- **(b)** blijven waar je bent en alleen het menu zien veranderen?
