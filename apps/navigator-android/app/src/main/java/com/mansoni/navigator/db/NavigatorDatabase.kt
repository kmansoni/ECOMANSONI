import com.squareup.sqldelight.ColumnAdapter
import com.squareup.sqldelight.Transacter
import com.squareup.sqldelight.db.SqlDriver
import com.squareup.sqldelight.dsl.ExperimentalColumnAdapterApi
import com.squareup.sqldelight.dsl.append
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString

val NavigatorDatabase = SqlDriver.Schema(
    version = 1,
    name = "navigator"
) {

    create("poi") {
        column("id", "INTEGER", primaryKey = true, autoincrement = true)
        column("name", "TEXT", unique = false)
        column("latitude", "REAL", unique = false)
        column("longitude", "REAL", unique = false)
        column("category", "TEXT", unique = false)
    }

    create("cached_route") {
        column("id", "INTEGER", primaryKey = true, autoincrement = true)
        column("start_name", "TEXT", unique = false)
        column("end_name", "TEXT", unique = false)
        column("route_json", "TEXT", unique = false)
    }
}

// DAO Poi
data class Poi(
    val id: Long? = null,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val category: String
)

interface PoiQueries : Transacter {
    fun selectAll(): List<PoiEntity>
    fun selectByCategory(category: String): List<PoiEntity>
    fun selectInBounds(minLat: Double, maxLat: Double, minLon: Double, maxLon: Double): List<PoiEntity>
    fun insert(poi: PoiEntity)
    fun update(poi: PoiEntity)
    fun delete(id: Long)
}

// DAO CachedRoute
data class CachedRoute(
    val id: Long? = null,
    val startName: String,
    val endName: String,
    val routeJson: String
)

interface RouteQueries : Transacter {
    fun selectAll(): List<CachedRouteEntity>
    fun insert(route: CachedRouteEntity)
    fun delete(id: Long)
}
