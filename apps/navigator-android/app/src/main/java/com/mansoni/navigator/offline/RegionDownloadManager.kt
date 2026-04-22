package com.mansoni.navigator.offline

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import java.io.File

class RegionDownloadManager(private val context: Context) {

    interface DownloadCallback {
        fun onProgress(progress: Int) // 0-100
        fun onCompleted(file: File)
        fun onError(error: String)
    }

    private val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private var currentDownloadId: Long = -1

    fun downloadRegion(
        regionId: String,
        url: String,
        callback: DownloadCallback
    ) {
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setTitle("Скачивание региона $regionId")
            setDescription("Оффлайн карты")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            setDestinationInExternalFilesDir(
                context,
                Environment.DIRECTORY_DOWNLOADS,
                "navigator/regions/$regionId.mbtiles"
            )
            setAllowedOverMetered(true)
            setAllowedOverRoaming(false)
        }

        currentDownloadId = downloadManager.enqueue(request)

        // Слушаем завершение загрузки
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: -1
                if (id == currentDownloadId) {
                    val query = DownloadManager.Query().setFilterById(id)
                    val cursor = downloadManager.query(query)
                    if (cursor.moveToFirst()) {
                        val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                        when (status) {
                            DownloadManager.STATUS_SUCCESSFUL -> {
                                val uriString = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI))
                                val file = File(Uri.parse(uriString).path ?: "")
                                callback.onCompleted(file)
                            }
                            DownloadManager.STATUS_FAILED -> {
                                callback.onError("Ошибка загрузки")
                            }
                        }
                    }
                    cursor.close()
                    context.unregisterReceiver(this)
                }
            }
        }

        context.registerReceiver(
            receiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        )

        // Мониторинг прогресса
        monitorProgress(currentDownloadId, callback)
    }

    private fun monitorProgress(downloadId: Long, callback: DownloadCallback) {
        val scope = CoroutineScope(Dispatchers.IO)
        scope.launch {
            while (true) {
                val query = DownloadManager.Query().setFilterById(downloadId)
                val cursor = downloadManager.query(query)
                if (cursor.moveToFirst()) {
                    val bytesDownloaded = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                    val bytesTotal = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                    if (bytesTotal > 0) {
                        val progress = (bytesDownloaded * 100 / bytesTotal).toInt()
                        callback.onProgress(progress)
                    }
                    cursor.close()
                }
                delay(500)
            }
        }
    }

    fun cancelDownload() {
        if (currentDownloadId != -1L) {
            downloadManager.remove(currentDownloadId)
        }
    }

    fun getDownloadedRegions(): List<File> {
        val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "navigator/regions")
        return if (dir.exists()) dir.listFiles()?.toList() ?: emptyList() else emptyList()
    }
}
