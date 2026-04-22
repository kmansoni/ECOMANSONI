package com.mansoni.navigator.offline

import android.content.Context
import android.os.Environment
import java.io.File

class TileCacheManager(private val context: Context) {

    private val cacheDir: File by lazy {
        File(context.getExternalFilesDir(null), "tile_cache").apply {
            if (!exists()) mkdirs()
        }
    }

    fun getTile(z: Int, x: Int, y: Int): File? {
        val file = File(cacheDir, "$z/$x/$y.png")
        return if (file.exists()) file else null
    }

    fun saveTile(z: Int, x: Int, y: Int, data: ByteArray) {
        val dir = File(cacheDir, "$z/$x")
        if (!dir.exists()) dir.mkdirs()
        val file = File(dir, "$y.png")
        file.writeBytes(data)
    }

    fun clearCache() {
        cacheDir.deleteRecursively()
        cacheDir.mkdirs()
    }

    fun getCacheSize(): Long {
        return cacheDir.walkTopDown()
            .filter { it.isFile }
            .map { it.length() }
            .sum()
    }
}
