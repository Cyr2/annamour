import java.util.Properties

plugins {
    id("com.android.application")
}

// The release keystore lives outside the repository. Its location can be overridden with
// -Pannamour.keystore=<path to a .properties file>. Without it, the release APK is left unsigned.
val keystorePropsFile = file(
    providers.gradleProperty("annamour.keystore").orNull
        ?: "${System.getProperty("user.home")}/.android-keys/annamour-tv.properties",
)
val keystoreProps = Properties().apply {
    if (keystorePropsFile.isFile) keystorePropsFile.inputStream().use { load(it) }
}

android {
    namespace = "fr.dpessin.annamour.tv"
    compileSdk = 37

    defaultConfig {
        applicationId = "fr.dpessin.annamour.tv"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            create("release") {
                storeFile = keystorePropsFile.parentFile.resolve(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        // Installs next to the real app (its own cookies, its own link to an account), to measure on the TV.
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
