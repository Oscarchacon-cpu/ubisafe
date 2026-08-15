# Configuración Teltonika FMB130 + Ubisafe

## 📋 Checklist de Configuración

### 1. Base de Datos
```bash
# Ejecutar migraciones SQL
psql -U postgres -d ubisafe -f backend/migrations/013_teltonika_rfid.sql
```

### 2. Configurar Vehículo en Ubisafe
Accede a tu base de datos y actualiza el vehículo:

```sql
UPDATE ubisafe.vehiculos
SET imei = '350612110030968'  -- Reemplazar con IMEI real del FMB130
WHERE placa = 'ABC-123';
```

**¿Dónde obtener el IMEI?**
- En el FMB130: Settings → Device Information → IMEI
- O en la etiqueta física del dispositivo

### 3. Configurar Conductor en Ubisafe
```sql
UPDATE ubisafe.choferes
SET tarjeta_rfid = '12345678'  -- ID de la tarjeta RFID
WHERE nombre = 'José García';
```

### 4. Configurar FMB130

#### Conexión a Internet (CRÍTICO)
```
Settings → Network → Mobile
- Country: Argentina
- Operator: Seleccionar (Movistar/Claro/Personal)
- APN: 
  * Movistar: internet.movil
  * Claro: internet.claro
  * Personal: gprs.personal.com
- Username: (dejar en blanco si no requiere)
- Password: (dejar en blanco si no requiere)
```

#### Configurar Servidor Ubisafe
```
Settings → Protocols → TCP
- Server: tu-dominio-o-ip.com  (ej: ubisafe.com)
- Port: 6029  (o el puerto que uses)
- Connection: Always Connected
- Send Interval: 60 (enviar datos cada 60 segundos)
```

#### Configurar RFID/Módulo Lector
```
Settings → Serial Ports → Port1
- Speed: 9600
- Data Bits: 8
- Stop Bits: 1
- Parity: None
- Device Type: Generic

Settings → I/O Elements
- Enable: Sí
- Digital Input 1: Habilitar
```

#### Configurar GPS
```
Settings → GPS
- Interval: 30 (actualizar GPS cada 30 segundos)
- Accuracy: 50 metros
```

### 5. Environment Backend
```bash
# .env
API_PORT=6029
CORS_ORIGIN=http://localhost:5173

# Base de datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ubisafe
DB_USER=postgres
DB_PASSWORD=tu_password
```

### 6. Flujo de Datos

```
FMB130 (GPS + RFID)
    ↓
POST /api/teltonika/gps-update
{
  "imei": "350612110030968",
  "lat": -34.6037,
  "lng": -58.3816,
  "speed": 45,
  "timestamp": "2024-01-15T10:30:00Z",
  "rfid": "12345678"
}
    ↓
Backend: Busca vehículo por IMEI
    ↓
Backend: Busca conductor por RFID
    ↓
Backend: Actualiza ubicación + asigna conductor
    ↓
Frontend: Se actualiza en tiempo real (WebSocket)
```

### 7. Prueba de Conectividad

#### Desde Terminal (Linux/Mac)
```bash
# Test conexión TCP
nc -zv tu-ip-ubisafe.com 6029

# Ver logs del backend
tail -f backend.log | grep teltonika
```

#### Desde FMB130
```
Settings → Send Test → Server Connection
(Debe responder con OK)
```

### 8. Verificar Datos en BD

```sql
-- Ver últimas ubicaciones
SELECT * FROM ubisafe.puntos_gps 
WHERE vehiculo_id = 1 
ORDER BY timestamp DESC 
LIMIT 10;

-- Ver escaneos de tarjetas
SELECT * FROM ubisafe.eventos_identificacion
WHERE vehiculo_id = 1
ORDER BY timestamp DESC;

-- Verificar asignación actual de conductor
SELECT v.placa, c.nombre, avc.fecha_inicio
FROM ubisafe.asignaciones_vehiculo_chofer avc
JOIN ubisafe.vehiculos v ON avc.vehiculo_id = v.id
JOIN ubisafe.choferes c ON avc.chofer_id = c.id
WHERE avc.activo = true;
```

### 9. Dashboard en Tiempo Real

1. Abrir: http://localhost:5173
2. Navegar a: Mapa Operativo → Monitoreo
3. Deberías ver:
   - Vehículo ABC-123 en ubicación GPS
   - Velocidad actual
   - Conductor asignado (José García)
   - Timestamp de última actualización

### 10. Troubleshooting

| Problema | Solución |
|----------|----------|
| FMB130 no conecta | Verificar APN + datos móviles activos |
| No aparece ubicación | Validar IMEI en BD / Verificar GPS tiene señal |
| Conductor no aparece | Validar tarjeta RFID en BD / Probar escaneo |
| Datos lentos | Aumentar Send Interval en FMB130 |
| Conexión rechazada | Validar puerto 6029 abierto en firewall |

### 11. Documentación Oficial
- **Teltonika FMB130**: https://wiki.teltonika.lt/view/FMB130
- **Protocolo MQTT**: https://docs.teltonika.lt/
- **Códigos de Error**: Ver manual técnico Teltonika

---

## 📍 Mapa de Comandos Rápidos

**Obtener IMEI del FMB130:**
```
Encender dispositivo → Esperar 30 segundos → 
Settings → Device Information → IMEI
```

**Asignar IMEI a vehículo:**
```sql
UPDATE ubisafe.vehiculos 
SET imei = 'YOUR_IMEI_HERE' 
WHERE id = 1;
```

**Ver últimas coordenadas:**
```sql
SELECT ST_Y(ubicacion_actual) as lat, 
       ST_X(ubicacion_actual) as lng,
       velocidad_actual
FROM ubisafe.vehiculos 
WHERE id = 1;
```

---

**¿Necesitas ayuda?** Revisa logs:
```bash
tail -100 backend.log | grep -i teltonika
```
