# 📋 UBISAFE - CONTEXTO DE CONTINUIDAD PROFESIONAL

**Última actualización**: 2026-08-15 (Día 2 - Mañana)  
**Estado**: Testing Backend - INICIANDO  
**Responsable**: Oscar Chacon + Claude (Ingeniero de Software)

---

## 🎯 VISIÓN DEL PROYECTO

**Ubisafe** es una plataforma GPS de flotas + anti-robo con:
- Multi-tenant (empresas independientes)
- Real-time tracking (WebSocket)
- Alertas automáticas (velocidad, geovallas, etc.)
- Dashboard analytics
- Integración Teltonika GPS devices

**Stack**: Node.js Express + PostgreSQL 17 + PostGIS + React + Leaflet

---

## ✅ QUÉ ESTÁ COMPLETO

### Backend (35+ endpoints)
- ✅ **Auth**: JWT, login, registro de empresas, usuarios
- ✅ **Vehículos**: CRUD, ubicación GPS (PostGIS), velocidad, combustible
- ✅ **Choferes**: CRUD, licencias, validaciones
- ✅ **Alertas**: Automáticas (velocidad, batería baja)
- ✅ **Viajes**: CRUD, tracking, distancia, combustible consumido
- ✅ **Geovallas**: Zonas permitidas/prohibidas/trabajo
- ✅ **Dashboard**: KPIs, resumen flota, reportes diarios
- ✅ **GPS**: POST /api/gps/ubicacion (Teltonika integration point)
- ✅ **WebSocket**: Real-time broadcasts a empresas (salas por empresa_id)
- ✅ **Multi-tenant**: Isolation por empresa_id en TODAS las queries

### Base de Datos
- ✅ PostgreSQL 17 + PostGIS 3.6.2
- ✅ Schema completo (15+ tablas)
- ✅ Full-text search
- ✅ Queries optimizadas con índices

### Infraestructura
- ✅ Local: funciona en http://localhost:6029
- ✅ Production: Railway backend + Vercel frontend
- ✅ .env configurado para ambos ambientes

---

## 🚀 PLAN DE HOY (15-Ago-2026)

### FASE 1: TESTING DEL BACKEND ← **ESTAMOS AQUÍ**
**Duración**: 30-45 min  
**Objetivo**: Verificar que todos los endpoints funcionan correctamente

**Qué probaremos**:
1. ✓ POST `/api/admin/onboarding/registrar` - crear empresa + admin
2. ✓ POST `/api/auth/login` - autenticación JWT
3. ✓ POST `/api/vehiculos` - crear vehículo con dispositivo GPS
4. ✓ POST `/api/gps/ubicacion` - recibir ubicación del GPS
5. ✓ GET `/api/dashboard/mapa` - obtener vehículos en mapa (GeoJSON)
6. ✓ WebSocket - verificar que se actualiza en tiempo real
7. ✓ Alertas - verificar que se generan automáticamente

**Herramientas**:
- `curl` o Postman (HTTP requests)
- Terminal (WebSocket listener)
- pgAdmin (verificar BD)

**Enseñanza**: 
- Cómo hacer requests profesionales
- Cómo verificar datos en BD
- Cómo debuggear APIs REST
- Testing manual antes de automatizado

---

### FASE 2: TELTONIKA INTEGRATION
**Duración**: 1-2 horas  
**Objetivo**: Conectar GPS real del dispositivo Teltonika FMC130

**Qué haremos**:
1. Configurar dispositivo con URL backend
2. Enviar GPS real a POST `/api/gps/ubicacion`
3. Verificar que actualiza vehículo en mapa
4. Verificar que genera alertas

---

### FASE 3: FRONTEND REACT
**Duración**: 4-6 horas  
**Objetivo**: Interfaz que consuma backend probado

**Stack**:
- React 18 + Vite
- Leaflet (maps)
- WebSocket (real-time)
- JWT auth

**Componentes**:
- Login page
- Dashboard layout
- Map component (vehicle markers)
- Alerts panel
- Reports

---

## 🏗️ ARQUITECTURA PROFESIONAL

### Por qué Backend-First
```
Frontend = PRESENTACIÓN (muestra datos)
Backend = LÓGICA (calcula, valida, alerta)

Si el backend está roto → frontend inútil
Si el backend es sólido → frontend es fácil
```

### Principios que aplicamos
1. **Separación de capas**: Frontend no tiene lógica de negocio
2. **Testing piramidal**: Unit → Integration → E2E
3. **Multi-tenancy**: Cada query filtra por empresa_id
4. **Real-time**: WebSocket para actualizaciones instantáneas
5. **Geocoding**: PostGIS para queries espaciales (geovallas)

---

## 🔑 COMANDOS ESENCIALES

### Iniciar backend
```bash
cd backend
npm install  # si es primera vez
npm start
# Escucha en http://localhost:6029
```

### Testear endpoints
```bash
# Crear empresa
curl -X POST http://localhost:6029/api/admin/onboarding/registrar \
  -H "Content-Type: application/json" \
  -d '{"nombre_empresa":"Test Inc","email_admin":"admin@test.com","nombre_admin":"Admin","password":"Password123","pais_id":1}'

# Login
curl -X POST http://localhost:6029/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"demo123"}'

# Recibir GPS (simular Teltonika)
curl -X POST http://localhost:6029/api/gps/ubicacion \
  -H "Content-Type: application/json" \
  -H "X-GPS-API-Key: test-key-12345" \
  -d '{"dispositivo_gps_id":"teltonika-001","lat":40.7128,"lng":-74.0060,"velocidad":55,"combustible_porcentaje":75}'
```

### Ver WebSocket en tiempo real
```bash
# Terminal 1: iniciar server
npm start

# Terminal 2: listener WebSocket
npx wscat -c http://localhost:6029/socket.io/?transport=websocket
```

---

## 📊 ENSEÑANZA EN PROGRESO

Oscar está aprendiendo:

### ✅ Completado
- [ ] Arquitectura multi-tenant
- [ ] PostgreSQL + PostGIS (queries geoespaciales)
- [ ] JWT authentication
- [ ] WebSocket real-time
- [ ] 35+ endpoints RESTful

### 🔄 Hoy aprenderá
- **Testing profesional**: Cómo verificar APIs antes de frontend
- **Debugging**: Cómo seguir datos desde request hasta BD
- **Backend-first mindset**: Por qué el orden importa
- **Real-time concepts**: WebSocket, eventos, broadcasting
- **Garbage in, garbage out**: Por qué datos correctos = frontend confiable

### ⏳ Próximo
- React development (mañana o después)
- E2E testing
- Optimización de queries
- Security hardening
- Deployment pipeline

---

## 🔗 REFERENCIAS

**Documentación API**: `/backend/src/routes/*.js` (cada ruta tiene comentarios)

**BD Schema**: Ver `/backend/src/db.js` (CREATE TABLE statements)

**Endpoints principales**:
- POST `/api/admin/onboarding/registrar` - crear empresa
- POST `/api/auth/login` - autenticarse
- POST `/api/vehiculos` - crear vehículo
- POST `/api/gps/ubicacion` - recibir GPS
- GET `/api/dashboard/mapa` - obtener mapa
- GET `/api/dashboard/resumen` - KPIs
- WebSocket: `join-empresa`, `gps-update`, `vehiculo-actualizado`

---

## 🎓 FILOSOFÍA DE TRABAJO

**Oscar + Claude = Equipo profesional**

- **Seguridad en cada paso**: No saltamos fases
- **Enseñanza integrada**: Cada comando explica el "por qué"
- **Documentación viva**: Este archivo se actualiza cada sesión
- **Continuidad garantizada**: Si se cae conexión, cargas esto y continuamos

---

## 📝 NOTAS IMPORTANTES

- **Password temporal**: Todos usan `demo123` en desarrollo (cambiar en producción!)
- **API Key GPS**: Por ahora `test-key-12345` (será configurable después)
- **CORS**: Habilitado para localhost:5173 (React default)
- **WebSocket**: Por empresa - cada empresa ve solo sus vehículos
- **Alertas**: Se generan automáticamente en POST `/api/gps/ubicacion`

---

## ✋ PRÓXIMO PASO

**¡Empezamos Testing del Backend!**

Oscar ejecuta:
```bash
cd C:\Users\Oscar Chacon\Desktop\Ubisafe\backend
npm start
```

Claude guía cada paso con explicaciones claras.

---

**Guardado**: 2026-08-15 09:00 AM  
**Versión**: 1.0 - Initial Context  
**Próxima revisión**: Fin de hoy (después de Frontend)
