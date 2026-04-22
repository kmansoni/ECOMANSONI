package com.mansoni.navigator.di

import android.app.Application
import android.content.Context

class NavigatorApp : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.init(this)
    }
}
