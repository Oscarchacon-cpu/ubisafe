# Ubisafe

Plataforma propia de monitoreo GPS para empresas de transporte (y potencialmente minería), con dos frentes:

1. **Gestión de flota**: telemetría, rutas, reportes de combustible, temperatura, horómetro, mantenimiento.
2. **Seguridad / antihurto**: geocercas, corte remoto de motor/combustible, alertas de desconexión de batería o jamming.

## Estado

Proyecto en fase inicial. Hardware de pruebas disponible: Teltonika FMC150 y FMC130.

## Orden de trabajo (MVP)

1. MVP antihurto + flota básica
2. Parser Teltonika Codec 8/8E
3. Modelo de datos multi-cliente (cliente → flota → vehículo → permisos)
4. Módulo de fatiga/somnolencia (cámara DMS)
5. Piloto con cliente real (transporte, no minero)
6. Evaluar camino hacia minería
7. Adaptador de salida a Samtech (requisito de acceso a faenas mineras)
