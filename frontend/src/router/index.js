import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Register from '../views/Register.vue'
import Home from '../views/Home.vue'
import Create from '../views/CreateSecret.vue'
import Update from '../views/UpdateSecret.vue'
import ChangePassword from "../views/ChangePassword.vue";
import CreateOrg from '../views/CreateOrg.vue'
import CreateOrgSecret from '../views/CreateOrgSecret.vue'
import OrganizationSecret from '../views/OrganizationSecret.vue'
import UpdateOrgSecret from '../views/UpdateOrgSecret.vue'
import ManageInvite from '../views/ManageInvite.vue'
import InviteConfirmation from '../views/InviteConfirmation.vue'

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', name: 'login', component: Login },
  { path: '/register', name: 'register', component: Register },
  { path: '/home', name: 'home', component: Home, meta: { requiresAuth: true } },
  { path: '/create', name: 'create', component: Create, meta: { requiresAuth: true } },
  { path: "/update/:id", name: "UpdateSecret", component: Update, meta: { requiresAuth: true } },
  { path: "/change-password", name: "ChangePassword", component: ChangePassword, meta: { requiresAuth: true } },
  { path: "/createOrg", name: "createOrg", component: CreateOrg, meta: { requiresAuth: true } },
  { path: '/createOrgSecret/:orgId', name: 'createOrgSecret',component: CreateOrgSecret, props: true, meta: { requiresAuth: true } },
  { path: '/org/:orgId', name: 'organizationSecret', component: OrganizationSecret, props: true, meta: { requiresAuth: true } },
  { path: '/updateOrgSecret/:orgId/:secretId', name: 'updateOrgSecret', component: UpdateOrgSecret, props: true, meta: { requiresAuth: true } },
  { path: '/ManageInvite', name: 'manageInvite', component: ManageInvite, props: true, meta: { requiresAuth: true } },
  { path: '/org/:orgId/confirmations', name: 'inviteConfirmation', component: InviteConfirmation, props: true, meta: { requiresAuth: true } }, 
  // Capture toutes les routes non trouvées et redirige
  { path: '/:catchAll(.*)', redirect: '/login' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
