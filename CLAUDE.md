# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AutoLog** is a single-file, zero-dependency web app for tracking vehicle service history. The entire application lives in `mech-history/index.html` — HTML, CSS, and JavaScript all in one file. No build step, no package manager, no framework.

The UI language is Brazilian Portuguese (pt-BR). Currency is displayed in BRL (R$).

## Running the App

Open `mech-history/index.html` directly in a browser. No server required.

## Architecture

All state is held in a single `state` object:
- `state.vehicles` — array of registered vehicle objects
- `state.records` — array of service record objects
- `state.activeId` — ID of the currently selected vehicle

Persistence is via `localStorage` (`save()` / `load()` functions). `uid()` generates unique IDs.

### Two-panel layout

| Left panel (`owner-col`) | Right panel (`mech-col`) |
|---|---|
| Cascade vehicle selector (brand → model → year → trim) | Stats strip (record count, total cost, last service date) |
| Vehicle registration form | Add service record form (collapsible) |
| Vehicle list with photo upload | Service history list with search |

### Key functions

- `onMarcaChange()` / `onModeloChange()` / `onAnoChange()` — cascade select handlers that populate dependent dropdowns from the embedded `CAR_DATA` object
- `addVehicle()` / `editVehicle()` / `deleteVehicle()` — CRUD for vehicles
- `addSvcRecord()` — creates a service record for the active vehicle
- `renderHistory()` / `renderStats()` — re-renders the mechanic panel
- `showDetail(id)` — opens the service record detail modal
- `updateMechPanel()` / `updateBadge()` — sync mechanic panel and header badge to `state.activeId`
- `openModal(id)` / `closeModal(id)` — show/hide overlay modals
- `showToast(msg)` — 2.8 s bottom toast notification

### Data shapes

Vehicle object: `{ id, make, model, year, trim, ownerName, ownerPhone, ownerEmail, mileage, notes, photo, addedAt }`

Service record: `{ id, vehicleId, date, mileage, serviceTypes[], notes, partsUsed, partsCost, laborCost, taxAmount, totalCost, shopName, shopPhone, shopAddr, techName, nextService, warranty, addedAt }`

## Git & GitHub Workflow

All commits should be pushed to GitHub. Commit messages must be clear and descriptive. Use `git` CLI for all version control operations.
