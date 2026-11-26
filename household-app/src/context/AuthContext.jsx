import { createContext, useContext, useEffect, useState } from 'react'
import supabase, { isSupabaseConfigured } from '../supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [household, setHousehold] = useState(null)
  const [households, setHouseholds] = useState([])
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const fetchUserHousehold = async (userId) => {
    if (!supabase || !userId) {
      setHousehold(null)
      setHouseholds([])
      return
    }

    try {
      const { data: members, error: memberError } = await supabase
        .from('household_members')
        .select(`
          household_id,
          role,
          households:household_id (
            id,
            name,
            created_at
          )
        `)
        .eq('user_id', userId)

      if (memberError) {
        console.error('Error fetching household members:', memberError)
        return
      }

      if (members && members.length > 0) {
        const userHouseholds = members
          .map((m) => ({
            id: m.household_id,
            name: m.households?.name || 'Rumah Tangga',
            role: m.role,
          }))
          .filter(Boolean)

        setHouseholds(userHouseholds)

        // Select previously saved or first household
        const savedHouseholdId = localStorage.getItem(`active_household_${userId}`)
        const active =
          userHouseholds.find((h) => h.id === savedHouseholdId) ||
          userHouseholds[0]

        setHousehold(active)
      } else {
        // Fallback: If trigger hasn't finished or was manually created
        const { data: newH, error: createError } = await supabase
          .from('households')
          .insert({
            name: 'Rumah Tangga Saya',
            created_by: userId,
          })
          .select()
          .single()

        if (!createError && newH) {
          await supabase.from('household_members').insert({
            household_id: newH.id,
            user_id: userId,
            role: 'owner',
          })
          const defaultH = { id: newH.id, name: newH.name, role: 'owner' }
          setHouseholds([defaultH])
          setHousehold(defaultH)
        }
      }
    } catch (err) {
      console.error('Failed to load household:', err)
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    let isMounted = true

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchUserHousehold(session.user.id).finally(() => {
          if (isMounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    // Listen to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        await fetchUserHousehold(session.user.id)
      } else {
        setHousehold(null)
        setHouseholds([])
      }
      setLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const switchHousehold = (householdId) => {
    const selected = households.find((h) => h.id === householdId)
    if (selected && user) {
      setHousehold(selected)
      localStorage.setItem(`active_household_${user.id}`, selected.id)
    }
  }

  const signIn = async (email, password) => {
    if (!supabase) throw new Error('Supabase client belum dikonfigurasi.')
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  const signUp = async (email, password, fullName) => {
    if (!supabase) throw new Error('Supabase client belum dikonfigurasi.')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setHousehold(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        household,
        households,
        loading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
        switchHousehold,
        refreshHousehold: () => user && fetchUserHousehold(user.id),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
