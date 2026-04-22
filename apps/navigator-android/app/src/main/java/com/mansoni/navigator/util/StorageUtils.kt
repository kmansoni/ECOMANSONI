package com.mansoni.navigator.util

import android.content.Context
import android.os.Environment
import java.io.File

object StorageUtils {
    fun getAppExternalDir(context: Context): File {
        return File(context.getExternalFilesDir(null), "navigator").apply { mkdirs() }
    }

    fun getTilesDir(context: Context): File {
        return File(getAppExternalDir(context), "tiles").apply { mkdirs() }
    }

    fun getRegionsDir(context: Context): File {
        return File(getAppExternalDir(context), "regions").apply { mkdirs() }
    }

    fun isExternalStorageWritable(): Boolean {
        return Environment.getExternalStorageState() == Environment.MEDIA_MOUNTED
    }
}
