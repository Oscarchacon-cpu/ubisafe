-- ========================================
-- MIGRATIONS: Soporte para telemetría real y lector de tarjeta
-- Ejecutar en: psql -U ubisafe_app -d ubisafe -f MIGRATIONS_TELEMETRIA.sql
-- ========================================

-- 1. Agregar campos a tabla VEHICULOS
ALTER TABLE ubisafe.vehiculos
ADD COLUMN IF NOT EXISTS capacidad_tanque_litros DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS combustible_litros DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS tipo_sensor_combustible VARCHAR(50) DEFAULT 'porcentaje',
ADD COLUMN IF NOT EXISTS temperatura_motor INT,
ADD COLUMN IF NOT EXISTS rpm INT,
ADD COLUMN IF NOT EXISTS tiene_id_card_reader BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tiene_boton_eventos BOOLEAN DEFAULT false;

-- 2. Agregar campos a tabla REGISTROS_GPS (telemetría por punto)
ALTER TABLE ubisafe.registros_gps
ADD COLUMN IF NOT EXISTS combustible_litros DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS temperatura_motor INT,
ADD COLUMN IF NOT EXISTS rpm INT,
ADD COLUMN IF NOT EXISTS bateria_porcentaje INT;

-- 3. Crear tabla EVENTOS_DISPOSITIVO (para botones, tarjeta ID, etc.)
CREATE TABLE IF NOT EXISTS ubisafe.eventos_dispositivo (
  id SERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES ubisafe.empresas(id),
  vehiculo_id INT NOT NULL REFERENCES ubisafe.vehiculos(id),
  dispositivo_gps_id VARCHAR(100) NOT NULL,
  tipo_evento VARCHAR(50) NOT NULL, -- 'id_card', 'boton_presionado', 'boton_liberado', 'puerta_abierta', etc.
  datos_evento JSONB, -- flexible: {"tarjeta_id": "12345", "conductor_id": 1} o {"boton": "SOS", "duracion": 5}
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eventos_vehiculo ON ubisafe.eventos_dispositivo(vehiculo_id);
CREATE INDEX IF NOT EXISTS idx_eventos_timestamp ON ubisafe.eventos_dispositivo(timestamp);

-- 4. Crear tabla LECTORES_TARJETA_MAPEO (asociar tarjeta ID a conductor)
CREATE TABLE IF NOT EXISTS ubisafe.lectores_tarjeta_mapeo (
  id SERIAL PRIMARY KEY,
  empresa_id INT NOT NULL REFERENCES ubisafe.empresas(id),
  chofer_id INT NOT NULL REFERENCES ubisafe.choferes(id),
  numero_tarjeta VARCHAR(50) NOT NULL UNIQUE,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tarjeta_chofer ON ubisafe.lectores_tarjeta_mapeo(numero_tarjeta);

-- 5. Crear tabla VIAJES_ACTUALIZADO (agregar info de inicio/fin por tarjeta)
ALTER TABLE ubisafe.viajes
ADD COLUMN IF NOT EXISTS chofer_id INT REFERENCES ubisafe.choferes(id),
ADD COLUMN IF NOT EXISTS fecha_fin TIMESTAMP,
ADD COLUMN IF NOT EXISTS distancia_recorrida DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS consumo_combustible DECIMAL(10,2);

-- 6. Comentarios informativos
COMMENT ON COLUMN ubisafe.vehiculos.capacidad_tanque_litros IS 'Capacidad máxima del tanque en litros';
COMMENT ON COLUMN ubisafe.vehiculos.tipo_sensor_combustible IS 'Tipo de sensor: porcentaje, litros, ambos';
COMMENT ON COLUMN ubisafe.registros_gps.combustible_litros IS 'Combustible en litros (si dispositivo lo envía)';
COMMENT ON TABLE ubisafe.eventos_dispositivo IS 'Eventos del dispositivo GPS: lectores tarjeta, botones, etc.';

-- Confirmación
SELECT 'Migraciones completadas exitosamente' as status;
