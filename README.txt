JC FINANZAS PRO — PWA

ARCHIVOS
- index.html
- styles.css
- app.js
- manifest.json
- service-worker.js
- icons/

INSTALAR EN IPHONE
1. Publica TODA esta carpeta en un sitio HTTPS.
2. Abre la URL publicada en Safari.
3. Toca Compartir.
4. Selecciona "Añadir a pantalla de inicio".
5. Abre JC Finanzas desde el icono instalado.

IMPORTANTE
- El modo PWA y el Service Worker no funcionan correctamente abriendo index.html directamente desde Archivos (file://).
- Face ID / Touch ID mediante WebAuthn requiere HTTPS.
- Los datos se guardan localmente en IndexedDB del navegador.
- El respaldo automático crea una copia local diaria y conserva las últimas 10.
- Descarga periódicamente el respaldo JSON para tener una copia fuera del dispositivo.

SEGURIDAD BIOMÉTRICA
La integración de WebAuthn de esta PWA es un bloqueo local de conveniencia. Un sistema financiero con autenticación de alta seguridad y sincronización entre dispositivos debería verificar las credenciales WebAuthn en un servidor seguro.


VERSIÓN 1.1
- Nuevo formulario PRO para ingresos y gastos.
- Monto grande, categorías visuales, saldo proyectado, aviso de presupuesto, fechas rápidas, notas, pagos habituales y guardar/registrar otro.
