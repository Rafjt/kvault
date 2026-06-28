import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Home from '../views/Home.vue'
import Create from '../views/CreateSecret.vue'
import Update from '../views/UpdateSecret.vue'
import ChangePassword from "../views/ChangePassword.vue";
import CreateOrg from '../views/CreateOrg.vue'



const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: Login },
  { path: '/register', name: 'register', component: Register },
  { path: '/home', name: 'home', component: Home, meta: { requiresAuth: true } },
  { path: '/create', name: 'create', component: Create, meta: { requiresAuth: true } },
  { path: "/update/:id", name: "UpdateSecret", component: Update, meta: { requiresAuth: true } },
  { path: "/change-password", name: "ChangePassword", component: ChangePassword, meta: { requiresAuth: true } },
  { path: "/createOrg", name: "createOrg", component: CreateOrg, meta: { requiresAuth: true } },
// Captulle toutes les routes non trouvées et redirige
  { path: '/:catchAll(.*)', redirect: '/login' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
