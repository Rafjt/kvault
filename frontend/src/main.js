import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'

import { authGuard } from './router/guard'

setInterval(() => {
  fetch('/auth/about')
    .then(() => console.log('Keep-alive ping réussi'))
    .catch(err => console.error('Ping error', err));
}, 90000); // 90 secondes < 2 minutes de Docker

router.beforeEach(authGuard)

const app = createApp(App)

const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')
