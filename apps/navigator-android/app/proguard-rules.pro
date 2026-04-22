# Add project specific ProGuard rules here.
-keepattributes *Annotation*
-keep class kotlin.Metadata { *; }
-keep class kotlinx.serialization.** { *; }

# Keep data classes
-keep class com.mansoni.navigator.ui.screens.** { *; }
-keep class com.mansoni.navigator.location.** { *; }
-keep class com.mansoni.navigator.routing.** { *; }
-keep class com.mansoni.navigator.voice.** { *; }
-keep class com.mansoni.navigator.offline.** { *; }

# Keep Navigation components
-keep class androidx.navigation.** { *; }
-keep class androidx.compose.** { *; }

# Keep FusedLocationProvider
-keep class com.google.android.gms.location.** { *; }
-keep class com.google.android.gms.tasks.** { *; }

-dontwarn org.jetbrains.kotlin.**
-dontwarn android.**
